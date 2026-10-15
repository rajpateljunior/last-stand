/* World: runtime tile state, collision, line of sight, zombie flow field, bot path finding, spatial hash. */

/* Runtime blocking arrays (rebuilt whenever a door opens, a window changes or a barrel blows):
   solidP  players + soldier bots     solidZ  zombies (windows open once the boards are gone)
   shot    bullets: 1 = stops, 2 = low cover (may stop)     sight  1 = blocks sight, 2 = corn (hides beyond a few metres) */
function initWorld(m, mode) {
  m.solidP = new Uint8Array(m.N); m.solidZ = new Uint8Array(m.N); m.shot = new Uint8Array(m.N); m.sight = new Uint8Array(m.N); m.light = new Uint8Array(m.N);
  m.winAt = new Int16Array(m.N).fill(-1);
  m.windows.forEach((w, k) => { m.winAt[w.i] = k; });
  m.barrelAt = new Int16Array(m.N).fill(-1);
  m.barrels.forEach((b, k) => { m.barrelAt[b.i] = k; });
  if (mode === "tdm") for (const d of m.doors) d.open = true;
  for (let i = 0; i < m.N; i++) refreshTile(m, i);
}

function doorOpen(m, i) { const d = m.obj[i]; return d >= 0 && m.doors[d].open; }
function refreshTile(m, i) {
  const t = m.tile[i];
  let p = 0, z = 0, s = 0, v = 0;
  switch (t) {
    case T_WALL: case T_HIGH: case T_TREE: p = z = s = v = 1; break;
    case T_LOW: p = z = 1; s = 2; break;
    case T_FENCE: p = z = 1; break;
    case T_WINDOW: p = 1; z = m.windows[m.winAt[i]] && m.windows[m.winAt[i]].boards > 0 ? 1 : 0; break;
    case T_DOOR: if (!doorOpen(m, i)) p = z = s = v = 1; break;
    case T_BARREL: if (m.barrels[m.barrelAt[i]].alive) p = z = s = v = 1; break;
  }
  if (t === T_FLOOR && m.floor[i] === F_CORN) v = 2;
  m.solidP[i] = p; m.solidZ[i] = z; m.shot[i] = s; m.sight[i] = v;
  // light passes over furniture and crates, not through walls, closed doors, trees or vehicles
  m.light[i] = t === T_WALL || t === T_TREE || (t === T_DOOR && !doorOpen(m, i)) || (t === T_HIGH && m.ch[i] === "v") ? 1 : 0;
}

const tileOf = (m, x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= m.W || ty >= m.H ? -1 : ty * m.W + tx; };
const tileCenter = (m, i) => [((i % m.W) + 0.5) * TILE, (((i / m.W) | 0) + 0.5) * TILE];
function isSolidAt(m, arr, x, y) { const i = tileOf(m, x, y); return i < 0 || arr[i] === 1; }

/* Push a circle out of solid tiles. Returns true if it touched anything. */
function resolveCircle(m, arr, a) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const r = a.r;
    const tx0 = Math.floor((a.x - r) / TILE), tx1 = Math.floor((a.x + r) / TILE), ty0 = Math.floor((a.y - r) / TILE), ty1 = Math.floor((a.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const solid = tx < 0 || ty < 0 || tx >= m.W || ty >= m.H || arr[ty * m.W + tx] === 1;
      if (!solid) continue;
      const bx0 = tx * TILE, by0 = ty * TILE, bx1 = bx0 + TILE, by1 = by0 + TILE;
      const cx = clamp(a.x, bx0, bx1), cy = clamp(a.y, by0, by1);
      let dx = a.x - cx, dy = a.y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2), push = r - d;
        a.x += (dx / d) * push; a.y += (dy / d) * push;
      } else {
        // centre inside the tile: leave by the nearest edge
        const l = a.x - bx0, rr = bx1 - a.x, t = a.y - by0, b = by1 - a.y, mn = Math.min(l, rr, t, b);
        if (mn === l) a.x = bx0 - r; else if (mn === rr) a.x = bx1 + r; else if (mn === t) a.y = by0 - r; else a.y = by1 + r;
      }
    }
  }
  return hit;
}

function moveCircle(m, arr, a, dx, dy) {
  // sub-step so fast movers (charges, lunges) never tunnel through a tile
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (a.r * 0.8)));
  let hit = false;
  for (let s = 0; s < steps; s++) { a.x += dx / steps; a.y += dy / steps; if (resolveCircle(m, arr, a)) hit = true; }
  return hit;
}

/* Grid ray march (Amanatides–Woo). arr: blocking array (1 = stop). onPartial(i, d) for value 2 → return true to stop.
   Returns { d, i, nx, ny } for the first stop, or { d: maxD, i: -1 }. */
function rayGrid(m, x0, y0, dx, dy, maxD, arr, onPartial) {
  let tx = Math.floor(x0 / TILE), ty = Math.floor(y0 / TILE);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(TILE / dx) : 1e9, tdy = dy !== 0 ? Math.abs(TILE / dy) : 1e9;
  let tmx = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE - x0 : x0 - tx * TILE) / Math.abs(dx)) : 1e9;
  let tmy = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE - y0 : y0 - ty * TILE) / Math.abs(dy)) : 1e9;
  let d = 0, nx = 0, ny = 0;
  for (let n = 0; n < 200; n++) {
    if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return { d, i: -2, nx, ny };
    const i = ty * m.W + tx, v = arr[i];
    if (v === 1 && n > 0) return { d, i, nx, ny };
    if (v === 1 && n === 0) { /* started inside a solid tile (muzzle poking through a wall) */ return { d: 0, i, nx: -dx, ny: -dy }; }
    if (v === 2 && onPartial && onPartial(i, d)) return { d, i, nx, ny, partial: true };
    if (tmx < tmy) { d = tmx; tmx += tdx; tx += stepX; nx = -stepX; ny = 0; }
    else { d = tmy; tmy += tdy; ty += stepY; nx = 0; ny = -stepY; }
    if (d >= maxD) return { d: maxD, i: -1, nx: 0, ny: 0 };
  }
  return { d: maxD, i: -1, nx: 0, ny: 0 };
}

function los(m, x0, y0, x1, y1, arr) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < 1) return true;
  return rayGrid(m, x0, y0, (x1 - x0) / d, (y1 - y0) / d, d, arr).i === -1;
}
// Can a circle of radius r walk straight from A to B? (two offset rays plus the centre)
function walkLine(m, x0, y0, x1, y1, r) {
  const d = Math.hypot(x1 - x0, y1 - y0); if (d < 1) return true;
  const ux = (x1 - x0) / d, uy = (y1 - y0) / d, px = -uy * r, py = ux * r;
  return rayGrid(m, x0, y0, ux, uy, d, m.solidP).i === -1 && rayGrid(m, x0 + px, y0 + py, ux, uy, d, m.solidP).i === -1 && rayGrid(m, x0 - px, y0 - py, ux, uy, d, m.solidP).i === -1;
}

/* ---------- binary heap for path searches ---------- */
class Heap {
  constructor(n) { this.k = new Int32Array(n * 8 + 16); this.p = new Float32Array(n * 8 + 16); this.n = 0; }
  push(k, p) { let i = this.n++; this.k[i] = k; this.p[i] = p; while (i > 0) { const j = (i - 1) >> 1; if (this.p[j] <= this.p[i]) break; this.sw(i, j); i = j; } }
  pop() { const top = this.k[0]; this.n--; if (this.n > 0) { this.k[0] = this.k[this.n]; this.p[0] = this.p[this.n]; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < this.n && this.p[l] < this.p[s]) s = l; if (r < this.n && this.p[r] < this.p[s]) s = r; if (s === i) break; this.sw(i, s); i = s; } } return top; }
  sw(a, b) { const k = this.k[a], p = this.p[a]; this.k[a] = this.k[b]; this.p[a] = this.p[b]; this.k[b] = k; this.p[b] = p; }
}
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

/* Zombie flow field: distance (in tiles) from every tile to the nearest target tile, walking as a zombie.
   Windows cost extra while boarded so zombies spread over several entry points. */
function zombieField(m, targets, out) {
  const N = m.N, W = m.W, H = m.H;
  const dist = out || new Float32Array(N);
  dist.fill(1e9);
  const heap = m._heap || (m._heap = new Heap(N));
  heap.n = 0;
  for (const i of targets) if (i >= 0) { dist[i] = 0; heap.push(i, 0); }
  const passZ = (i) => { const t = m.tile[i]; return t === T_FLOOR || (t === T_DOOR && doorOpen(m, i)) || t === T_WINDOW || (t === T_BARREL && !m.barrels[m.barrelAt[i]].alive); };
  while (heap.n) {
    const c = heap.pop(), cd = dist[c], x = c % W, y = (c / W) | 0;
    for (const [dx, dy, cost] of DIRS8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!passZ(j)) continue;
      if (dx && dy && (!passZ(y * W + nx) || !passZ(ny * W + x) || m.tile[y * W + nx] === T_WINDOW || m.tile[ny * W + x] === T_WINDOW)) continue;
      let c2 = cost;
      if (m.tile[j] === T_WINDOW) c2 += m.windows[m.winAt[j]].boards > 0 ? 4 + m.windows[m.winAt[j]].boards : 1;
      if (m.tile[c] === T_WINDOW && dx && dy) continue;
      if (m.floor[j] === F_CORN) c2 *= 1.25;
      const nd = cd + c2;
      if (nd < dist[j]) { dist[j] = nd; heap.push(j, nd); }
    }
  }
  return dist;
}

/* A* for soldier bots on the players' walk grid. Returns tile indices from start to goal (inclusive) or null. */
function findPath(m, sx, sy, gx, gy) {
  const W = m.W, N = m.N;
  const s = tileOf(m, sx, sy), g = tileOf(m, gx, gy);
  if (s < 0 || g < 0) return null;
  if (m.solidP[g]) return null;
  const gs = m._g || (m._g = new Float32Array(N)), from = m._from || (m._from = new Int32Array(N)), stamp = m._st || (m._st = new Int32Array(N));
  m._stamp = (m._stamp || 0) + 1; const ST = m._stamp;
  const heap = m._aheap || (m._aheap = new Heap(N)); heap.n = 0;
  const gxT = g % W, gyT = (g / W) | 0;
  const h = (i) => { const dx = Math.abs((i % W) - gxT), dy = Math.abs(((i / W) | 0) - gyT); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  stamp[s] = ST; gs[s] = 0; from[s] = -1; heap.push(s, h(s));
  let iter = 0;
  while (heap.n && iter++ < 6000) {
    const c = heap.pop();
    if (c === g) {
      const out = []; for (let k = g; k >= 0; k = from[k]) out.push(k);
      return out.reverse();
    }
    const x = c % W, y = (c / W) | 0, cg = gs[c];
    for (const [dx, dy, cost] of DIRS8) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.H) continue;
      const j = ny * W + nx; if (m.solidP[j]) continue;
      if (dx && dy && (m.solidP[y * W + nx] || m.solidP[ny * W + x])) continue;
      const ng = cg + cost * (m.floor[j] === F_CORN ? 1.3 : 1);
      if (stamp[j] !== ST || ng < gs[j]) { stamp[j] = ST; gs[j] = ng; from[j] = c; heap.push(j, ng + h(j)); }
    }
  }
  return null;
}

/* Nearest walkable tile to a point (for spawns and goals). */
function nearestOpen(m, x, y, arr = m.solidP) {
  const t = tileOf(m, x, y);
  if (t >= 0 && !arr[t]) return t;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const nx = tx + dx, ny = ty + dy; if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
    const j = ny * m.W + nx; if (!arr[j]) return j;
  }
  return t;
}

/* Spatial hash of actors (rebuilt every step) */
const HASH_CELL = 80;
function makeHash(m) { return { cw: Math.ceil(m.pw / HASH_CELL) + 1, ch: Math.ceil(m.ph / HASH_CELL) + 1, cells: new Map() }; }
function hashClear(h) { h.cells.clear(); }
function hashAdd(h, a) {
  const k = Math.floor(a.y / HASH_CELL) * h.cw + Math.floor(a.x / HASH_CELL);
  let c = h.cells.get(k); if (!c) { c = []; h.cells.set(k, c); } c.push(a);
}
function hashQuery(h, x, y, r, out) {
  out.length = 0;
  const x0 = Math.floor((x - r) / HASH_CELL), x1 = Math.floor((x + r) / HASH_CELL), y0 = Math.floor((y - r) / HASH_CELL), y1 = Math.floor((y + r) / HASH_CELL);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const c = h.cells.get(cy * h.cw + cx); if (c) for (const a of c) out.push(a); }
  return out;
}

/* Segment vs circle: returns t (0..1) of the first contact or -1 */
function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a === 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
