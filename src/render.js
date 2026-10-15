/* Renderer: camera, baked ground, 2.5D walls and props, actors, particles, darkness with flashlight shadows,
   glow pass, weather, HUD. Draws one view (solo / shared screen) or two views (split screen). */

const R = { parts: [], corpses: [], tracers: [], flashes: [], booms: [], arcs: [], pops: [], toasts: [], feed: [], announce: null, lightning: 0, shakes: [0, 0] };

function initRender(G) {
  const m = G.map;
  R.G = G;
  R.parts = []; R.corpses = []; R.tracers = []; R.flashes = []; R.booms = []; R.arcs = []; R.pops = []; R.toasts = []; R.feed = []; R.announce = null; R.lightning = 0; R.hit = [0, 0]; R.kill = [0, 0];
  R.dmgDir = [[], []]; R.hurtFlash = [0, 0]; R.cams = [null, null]; R.boxSpin = 0; R.powerT = 0; R.rainT = 0;
  ZSHIRT = ZCLOTH[m.id] || ZCLOTH.outpost;
  // wall look per tile: buildings get a style from their room, the outer walls their own
  R.wallStyle = new Array(m.N);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x; if (m.tile[i] !== T_WALL && m.tile[i] !== T_DOOR && m.tile[i] !== T_WINDOW) continue;
    let st = m.theme.perim;
    for (let r = 1; r <= 2 && st === m.theme.perim; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H) continue;
      const j = yy * m.W + xx; if (m.floor[j] === F_IN && m.tile[j] === T_FLOOR) { st = m.theme.walls[(m.area[j] * 5 + 1) % m.theme.walls.length]; }
    }
    R.wallStyle[i] = st;
  }
  R.patterns = {};
  R.lightC = makeCanvas(16, 16); R.lightG = R.lightC.getContext("2d");
  R.fogC = makeFog();
  R.cornSpr = [0, 1, 2].map((k) => cornSprite(k));
  // vehicles
  R.veh = m.vehicles.map((v) => Object.assign({ v }, vehicleSprite(v, m.theme, m.id)));
  R.vehAt = new Int16Array(m.N).fill(-1);
  m.vehicles.forEach((v, k) => { for (const [x, y] of v.tiles) R.vehAt[y * m.W + x] = k; });
  R.lowAt = new Int16Array(m.N).fill(-1);
  m.lows.forEach((v, k) => { if (v.tiles) for (const [x, y] of v.tiles) R.lowAt[y * m.W + x] = k; });
  // ground + everything that never changes (walls' faces, crates, cars, fences, sandbags, tree trunks) baked once
  R.ground = bakeGround(m);
  R.gctx = R.ground.getContext("2d");
  drawPropsBase(R.gctx, G, 0, 0, m.W - 1, m.H - 1, 0, true);
}

function wallPattern(style, col) {
  const key = style + col;
  if (R.patterns[key]) return R.patterns[key];
  const c = makeCanvas(40, 20), g = c.getContext("2d");
  g.fillStyle = col; g.fillRect(0, 0, 40, 20);
  g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = 1;
  if (style === "brick") { for (let y = 0; y < 20; y += 5) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(40, y + 0.5); g.stroke(); for (let x = (y / 5) % 2 ? 5 : 0; x < 40; x += 10) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 5); g.stroke(); } } }
  else if (style === "wood") { for (let y = 0; y < 20; y += 4) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, y + 3, 40, 1); g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(0, y, 40, 1); } }
  else if (style === "metal") { for (let x = 0; x < 40; x += 5) { g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(x, 0, 2, 20); g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(x + 2, 0, 1, 20); } }
  else if (style === "stone") { for (let k = 0; k < 6; k++) { g.strokeRect((k * 13) % 40, (k * 7) % 20, 12, 7); } }
  else if (style === "stucco") { for (let k = 0; k < 60; k++) { g.fillStyle = rgba(Math.random() < 0.5 ? "#000" : "#fff", 0.06); g.fillRect(Math.random() * 40, Math.random() * 20, 1.5, 1.5); } }
  else { for (let y = 0; y < 20; y += 10) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(40, y + 0.5); g.stroke(); for (let x = (y / 10) % 2 ? 10 : 0; x < 40; x += 20) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 10); g.stroke(); } } }
  const p = R.lightG.createPattern(c, "repeat");
  R.patterns[key] = p;
  return p;
}

// wall tops: a cap texture (concrete block / bricks / planks / sheet metal) seen from above
function wallCapPattern(st) {
  const key = "cap" + st[0] + st[1];
  if (R.patterns[key]) return R.patterns[key];
  const c = makeCanvas(40, 40), g = c.getContext("2d");
  const k = st[0];
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1;
  if (k === "brick") { for (let y = 0; y < 40; y += 8) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(40, y + 0.5); g.stroke(); for (let x = (y / 8) % 2 ? 10 : 0; x < 40; x += 20) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 8); g.stroke(); } } }
  else if (k === "wood") { for (let x = 0; x < 40; x += 8) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 7, 0, 1, 40); g.fillStyle = "rgba(255,255,255,.05)"; g.fillRect(x, 0, 1, 40); } }
  else if (k === "metal") { for (let x = 0; x < 40; x += 6) { g.fillStyle = "rgba(255,255,255,.06)"; g.fillRect(x, 0, 2, 40); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 3, 0, 1, 40); } }
  else { g.strokeRect(0.5, 0.5, 40, 20); g.strokeRect(20.5, 20.5, 40, 20); g.strokeRect(-19.5, 20.5, 40, 20); }
  for (let n = 0; n < 50; n++) { g.fillStyle = rgba(Math.random() < 0.5 ? "#000" : "#fff", 0.05); g.fillRect(Math.random() * 40, Math.random() * 40, 2, 2); }
  const p = R.lightG.createPattern(c, "repeat");
  R.patterns[key] = p; return p;
}

function makeFog() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext("2d");
  for (let k = 0; k < 70; k++) {
    const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 60;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, "rgba(200,210,205,.10)"); grd.addColorStop(1, "rgba(200,210,205,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill();
    }
  }
  return c;
}
function cornSprite(k) {
  return spr("corn" + k, 40, 40, (g) => {
    const Rn = rng(k * 99 + 5);
    for (let n = 0; n < 9; n++) {
      const x = 4 + Rn() * 32, y = 4 + Rn() * 32;
      for (let l = 0; l < 5; l++) {
        const a = Rn() * TAU, L = 6 + Rn() * 9;
        g.strokeStyle = Rn() < 0.3 ? "#9a8a3a" : Rn() < 0.6 ? "#6f7a2e" : "#4e5a24"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + 2, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
      }
      g.fillStyle = "#c9a43a"; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
    }
  });
}

/* ---------------- camera ---------------- */
function viewZoom(w, h) { return clamp(Math.sqrt((w * h) / 335000), 0.8, 1.35); }
function updateCamera(G, V, dt) {
  const ps = V.players.filter((p) => p);
  if (!ps.length) return;
  let tx = 0, ty = 0;
  for (const p of ps) { tx += p.x + Math.cos(p.ang) * (p.alive && !p.down ? 55 : 0); ty += p.y + Math.sin(p.ang) * (p.alive && !p.down ? 40 : 0); }
  tx /= ps.length; ty /= ps.length;
  let zoom = viewZoom(V.w, V.h);
  if (V.demo) { zoom *= 1.05; if (V.w > V.h) tx -= (V.w * 0.2) / zoom; else ty -= (V.h * 0.22) / zoom; }
  if (ps.length > 1) {
    const dx = Math.abs(ps[0].x - ps[1].x) + 260, dy = Math.abs(ps[0].y - ps[1].y) + 220;
    zoom = Math.min(zoom, V.w / dx, V.h / dy);
    zoom = Math.max(zoom, 0.42);
  }
  if (!V.cam) V.cam = { x: tx, y: ty, z: zoom };
  const k = Math.min(1, dt * 7);
  V.cam.x += (tx - V.cam.x) * k; V.cam.y += (ty - V.cam.y) * k; V.cam.z += (zoom - V.cam.z) * Math.min(1, dt * 3);
  // keep inside the map
  const m = G.map, hw = V.w / 2 / V.cam.z, hh = V.h / 2 / V.cam.z;
  V.cam.x = m.pw < hw * 2 ? m.pw / 2 : clamp(V.cam.x, hw, m.pw - hw);
  V.cam.y = m.ph < hh * 2 ? m.ph / 2 : clamp(V.cam.y, hh - WH, m.ph - hh);
}

/* ---------------- frame ---------------- */
function renderGame(ctx, G, views, t, dt) {
  stepParticles(G, dt);
  for (const V of views) {
    updateCamera(G, V, dt);
    drawView(ctx, G, V, t, dt);
  }
  if (views.length > 1) { ctx.fillStyle = "#000"; ctx.fillRect(views[1].x0 - 1.5, 0, 3, CH); }
  drawHUD(ctx, G, views, t, dt);
}

function worldXform(ctx, V, shake) {
  const z = V.cam.z;
  ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (V.x0 + V.w / 2 + shake[0] - V.cam.x * z), DPR * (V.y0 + V.h / 2 + shake[1] - V.cam.y * z));
}

function drawView(ctx, G, V, t, dt) {
  const m = G.map, z = V.cam.z;
  const me = V.players[0];
  const sh = V.shake || (V.shake = { a: 0 });
  sh.a = Math.max(0, sh.a - dt * 30);
  const shake = [Math.sin(t * 70) * sh.a, Math.cos(t * 63) * sh.a];
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.beginPath(); ctx.rect(V.x0, V.y0, V.w, V.h); ctx.clip();
  ctx.fillStyle = "#050505"; ctx.fillRect(V.x0, V.y0, V.w, V.h);
  worldXform(ctx, V, shake);
  const wx0 = V.cam.x - V.w / 2 / z - 10, wy0 = V.cam.y - V.h / 2 / z - 10, wx1 = V.cam.x + V.w / 2 / z + 10, wy1 = V.cam.y + V.h / 2 / z + 10 + WH;
  V.wr = [wx0, wy0, wx1, wy1];
  // ground
  const sx = clamp(wx0, 0, m.pw), sy = clamp(wy0, 0, m.ph), sw = clamp(wx1, 0, m.pw) - sx, shh = clamp(wy1, 0, m.ph) - sy;
  if (sw > 0 && shh > 0) ctx.drawImage(R.ground, sx * GS, sy * GS, sw * GS, shh * GS, sx, sy, sw, shh);
  const tx0 = Math.max(0, Math.floor(wx0 / TILE)), ty0 = Math.max(0, Math.floor(wy0 / TILE)), tx1 = Math.min(m.W - 1, Math.floor(wx1 / TILE)), ty1 = Math.min(m.H - 1, Math.floor(wy1 / TILE) + 1);
  drawPropsBase(ctx, G, tx0, ty0, tx1, ty1, t);
  // things on the floor
  for (const c of R.corpses) if (c.x > wx0 - 40 && c.x < wx1 + 40 && c.y > wy0 - 40 && c.y < wy1 + 40) drawCorpse(ctx, c, t);
  for (const d of G.drops) drawDrop(ctx, d, t);
  for (const p of G.powerups) drawPowerup(ctx, p, t);
  drawParticles(ctx, G, "floor", wx0, wy0, wx1, wy1);
  // actors, back to front
  const list = G.actors.filter((a) => (a.alive || (a.kind === "soldier" && false)) && a.x > wx0 - 60 && a.x < wx1 + 60 && a.y > wy0 - 60 && a.y < wy1 + 60);
  list.sort((p, q) => p.y - q.y);
  for (const a of list) {
    if (a.kind === "zombie") drawZombie(ctx, a, t);
    else {
      const ring = G.mode === "tdm" ? TEAM_COL[a.team] : a.human ? playerColor(G, a) : null;
      ctx.globalAlpha = a.protectT > 0 ? 0.55 + Math.sin(t * 20) * 0.2 : 1;
      drawSoldier(ctx, a, t, { ring, band: G.mode === "tdm" ? TEAM_COL[a.team] : a.human ? playerColor(G, a) : null });
      ctx.globalAlpha = 1;
    }
  }
  for (const p of G.projs) drawProjectile(ctx, p, t);
  drawPropsTop(ctx, G, tx0, ty0, tx1, ty1, t, V);
  drawParticles(ctx, G, "air", wx0, wy0, wx1, wy1);
  // name tags over other humans / bots in TDM
  ctx.font = "600 9px 'Chakra Petch', sans-serif"; ctx.textAlign = "center";
  for (const a of list) {
    if (a.kind !== "soldier" || V.players.includes(a)) continue;
    if (G.mode === "tdm" && a.team !== (me ? me.team : 0)) continue;
    ctx.fillStyle = a.human ? "#fff" : "rgba(255,255,255,.6)";
    ctx.fillText(a.name, a.x, a.y - 22);
  }
  // fog sits under the darkness, so lights shine through it
  if (G.map.theme.weather === "fog") { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawFog(ctx, G, V, t); }
  // darkness + lights
  drawLighting(ctx, G, V, t, shake);
  worldXform(ctx, V, shake);
  drawGlow(ctx, G, V, t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawWeather(ctx, G, V, t, dt);
  // red edges when hurt, desaturate when low (not while waiting to respawn)
  if (me && (me.alive || G.mode === "zombies")) drawHurt(ctx, G, V, me, t);
  else if (me && !me.alive) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(V.x0, V.y0, V.w, V.h); }
  ctx.restore();
}

function playerColor(G, a) { return a.pidx === 1 || (a.netId === 1) ? "#ffb12a" : "#4ad4ff"; }

/* ---------------- props: base pass (under actors) ---------------- */
/* staticPass = baked once into the ground image; otherwise only the things that change (doors, windows, barrels,
   box, perks, Forge, power switch) are drawn each frame. */
function drawPropsBase(g, G, tx0, ty0, tx1, ty1, t, staticPass) {
  const m = G.map, T = TILE, W = m.W;
  const drawnVeh = new Set(), drawnLow = new Set();
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const i = y * W + x, tl = m.tile[i], x0 = x * T, y0 = y * T, c = m.ch[i];
    const dyn = tl === T_WINDOW || tl === T_DOOR || tl === T_BARREL || (tl === T_HIGH && (c === "P" || c === "B" || c === "F" || c === "S"));
    if (dyn === !!staticPass) continue;
    switch (tl) {
      case T_WALL: {
        // the front face shows if the tile below isn't a wall (a closed door covers it with its own block)
        if (y + 1 < m.H && m.tile[i + W] !== T_WALL && m.tile[i + W] !== T_WINDOW) {
          const st = R.wallStyle[i] || m.theme.perim;
          g.fillStyle = wallPattern(st[0], shade(st[1], -0.3)); g.fillRect(x0, y0 + T - WH, T, WH);
          g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x0, y0 + T - 2, T, 2);
        }
        break;
      }
      case T_WINDOW: drawWindowBase(g, G, i, x0, y0); break;
      case T_DOOR: if (!doorOpen(m, i)) drawDoorBase(g, G, i, x0, y0, t); break;
      case T_HIGH:
        if (c === "v") { const k = R.vehAt[i]; if (k >= 0 && !drawnVeh.has(k)) { drawnVeh.add(k); drawVehicle(g, R.veh[k]); } }
        else if (c === "c") drawCrate(g, G, x, y, i);
        else if (c === "P") { const p = m.perks.find((q) => q.x === x && q.y === y); if (p && !p.gone) g.drawImage(perkSprite(p.perk, (G.z && (G.z.power || !PERKS[p.perk].power))), x0, y0 - 6, T, T); else if (p) { g.fillStyle = "#222"; g.fillRect(x0 + 4, y0 + 4, 32, 32); } }
        else if (c === "B") drawBoxSpot(g, G, x, y, t);
        else if (c === "F") g.drawImage(forgeSprite(G.z && G.z.power), x0, y0 - 4, T, T);
        else if (c === "S") g.drawImage(switchSprite(G.z && G.z.power), x0, y0 - 4, T, T);
        break;
      case T_LOW: {
        const k = R.lowAt[i];
        if (c === "g") g.drawImage(graveSprite(x * 7 + y), x0, y0 - 6, T, T);
        else if (k >= 0 && !drawnLow.has(k)) { drawnLow.add(k); drawLowRun(g, G, m.lows[k], t); }
        break;
      }
      case T_FENCE: drawFence(g, m, x, y); break;
      case T_TREE: g.fillStyle = "#3a2a1c"; g.beginPath(); g.arc(x0 + 20, y0 + 22, 7, 0, TAU); g.fill(); break;
      case T_BARREL: { const b = m.barrels[m.barrelAt[i]]; g.drawImage(barrelSprite(!b.alive), x0 + 4, y0 + 2, 32, 32); break; }
    }
    if (c === "L" && staticPass) { g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(x0 + 20, y0 + 20, 4, 0, TAU); g.fill(); }
  }
}

function drawVehicle(g, V) {
  const v = V.v, x0 = v.x0 * TILE, y0 = v.y0 * TILE, w = (v.x1 - v.x0 + 1) * TILE, h = (v.y1 - v.y0 + 1) * TILE;
  g.save();
  if (V.horiz) { g.drawImage(V.c, x0, y0 - 6, w, h); }
  else { g.translate(x0 + w / 2, y0 + h / 2 - 6); g.rotate(Math.PI / 2); g.drawImage(V.c, -h / 2, -w / 2, h, w); }
  g.restore();
}

function crateKind(G, x, y, i) {
  const m = G.map;
  if (m.floor[i] !== F_IN) return m.id === "outpost" ? (hash2(x, y) < 0.6 ? "military" : "wood") : m.id === "farm" ? "wood" : hash2(x, y) < 0.5 ? "wood" : "military";
  const k = m.indoorKind ? m.indoorKind(i) : "";
  if (m.id === "downtown") return k === "checker" ? "booth" : k === "wood" ? "desk" : "shelf";
  if (m.id === "outpost") return m.area[nearestOpen(m, (x + 0.5) * TILE, (y + 0.5) * TILE)] === m.startArea ? "desk" : "bunk";
  return k === "dirtfloor" ? "hay" : "desk";
}
function drawCrate(g, G, x, y, i) {
  const k = crateKind(G, x, y, i);
  const s = crateSprite(k, x * 13 + y * 7);
  g.drawImage(s, x * TILE, y * TILE - WH * 0.6, TILE, TILE + WH * 0.6);
}

function drawLowRun(g, G, run, t) {
  const m = G.map;
  const kind = m.id === "farm" ? "hay" : m.id === "downtown" ? "planter" : "sand";
  for (const [x, y] of run.tiles) {
    const x0 = x * TILE, y0 = y * TILE;
    if (kind === "sand") {
      for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
        const bx = x0 + 6 + k * 14 + (r ? 7 : 0), by = y0 + 12 + r * 12 - 6;
        g.fillStyle = "#4e4630"; g.beginPath(); g.ellipse(bx, by + 3, 8, 5.5, 0, 0, TAU); g.fill();
        g.fillStyle = "#8a7c56"; g.beginPath(); g.ellipse(bx, by, 7.5, 5, 0, 0, TAU); g.fill();
        g.strokeStyle = "rgba(0,0,0,.25)"; g.stroke();
      }
    } else if (kind === "hay") {
      g.fillStyle = "#6b5a2a"; g.fillRect(x0 + 2, y0 + 8, 36, 30);
      g.fillStyle = "#c9a84e"; g.fillRect(x0 + 2, y0 + 2, 36, 30);
      g.strokeStyle = "#8a6f2a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + 13, y0 + 2); g.lineTo(x0 + 13, y0 + 32); g.moveTo(x0 + 27, y0 + 2); g.lineTo(x0 + 27, y0 + 32); g.stroke();
      for (let k = 0; k < 10; k++) { g.strokeStyle = "rgba(255,240,180,.25)"; g.beginPath(); const px = x0 + 4 + hash2(x, y, k) * 32, py = y0 + 4 + hash2(y, x, k) * 26; g.moveTo(px, py); g.lineTo(px + 4, py + 1); g.stroke(); }
    } else {
      g.fillStyle = "#5a5852"; g.fillRect(x0 + 4, y0 + 8, 32, 28);
      g.fillStyle = "#8a8780"; g.fillRect(x0 + 4, y0 + 4, 32, 28);
      g.fillStyle = "#2f4a26"; g.beginPath(); g.arc(x0 + 20, y0 + 17, 11, 0, TAU); g.fill();
      g.fillStyle = "#3e5f30"; g.beginPath(); g.arc(x0 + 17, y0 + 14, 6, 0, TAU); g.fill();
    }
  }
}

function drawFence(g, m, x, y) {
  const x0 = x * TILE, y0 = y * TILE;
  const fz = (dx, dy) => { const c = m.ch[(y + dy) * m.W + x + dx]; return c === "f" || (c === "D" && false); };
  const hor = fz(1, 0) || fz(-1, 0) || !(fz(0, 1) || fz(0, -1));
  const wood = m.id === "farm";
  g.strokeStyle = wood ? "rgba(120,96,64,.95)" : "rgba(170,175,180,.55)";
  g.lineWidth = wood ? 3 : 1;
  if (hor) {
    if (wood) { g.beginPath(); g.moveTo(x0, y0 + 14); g.lineTo(x0 + 40, y0 + 14); g.moveTo(x0, y0 + 22); g.lineTo(x0 + 40, y0 + 22); g.stroke(); }
    else { for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x0 + k * 5, y0 + 12); g.lineTo(x0 + k * 5 + 5, y0 + 24); g.moveTo(x0 + k * 5 + 5, y0 + 12); g.lineTo(x0 + k * 5, y0 + 24); g.stroke(); } }
    g.fillStyle = wood ? "#5a4530" : "#7a7f84"; g.fillRect(x0 - 1.5, y0 + 10, 3, 16);
  } else {
    if (wood) { g.beginPath(); g.moveTo(x0 + 16, y0); g.lineTo(x0 + 16, y0 + 40); g.moveTo(x0 + 24, y0); g.lineTo(x0 + 24, y0 + 40); g.stroke(); }
    else { for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(x0 + 14, y0 + k * 5); g.lineTo(x0 + 26, y0 + k * 5 + 5); g.moveTo(x0 + 26, y0 + k * 5); g.lineTo(x0 + 14, y0 + k * 5 + 5); g.stroke(); } }
    g.fillStyle = wood ? "#5a4530" : "#7a7f84"; g.fillRect(x0 + 18.5, y0 - 1.5, 3, 3);
  }
}

function drawWindowBase(g, G, i, x0, y0) {
  const m = G.map, w = m.windows[m.winAt[i]], st = R.wallStyle[i] || m.theme.perim;
  // sill + frame
  g.fillStyle = shade(st[1], -0.45);
  if (w.ori === 0) { g.fillRect(x0, y0 + 10, 40, 20); g.fillStyle = "#2a2622"; g.fillRect(x0 + 3, y0 + 13, 34, 14); }
  else { g.fillRect(x0 + 10, y0, 20, 40); g.fillStyle = "#2a2622"; g.fillRect(x0 + 13, y0 + 3, 14, 34); }
  // boards
  for (let k = 0; k < w.boards; k++) {
    g.save(); g.translate(x0 + 20, y0 + 20);
    if (w.ori === 1) g.rotate(Math.PI / 2);
    g.rotate([-0.35, 0.3, -0.12, 0.42, -0.5][k]);
    g.fillStyle = ["#8a6438", "#7a5630", "#946c40", "#6e4c2a", "#86603a"][k];
    g.fillRect(-22, -3.5 + (k - 2) * 4, 44, 6);
    g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(-22, 2 + (k - 2) * 4, 44, 1);
    g.fillStyle = "#222"; g.fillRect(-18, -1 + (k - 2) * 4, 2, 2); g.fillRect(16, -1 + (k - 2) * 4, 2, 2);
    g.restore();
  }
}

function drawDoorBase(g, G, i, x0, y0, t) {
  const m = G.map, d = m.doors[m.obj[i]];
  if (d.style === "debris") {
    g.drawImage(debrisSprite(i), x0, y0, 40, 40);
    return;
  }
  if (false) {
    const R0 = rng(i * 13);
    g.fillStyle = "#2c2824"; g.fillRect(x0 + 2, y0 + 4, 36, 34);
    for (let k = 0; k < 7; k++) {
      g.save(); g.translate(x0 + 6 + R0() * 28, y0 + 6 + R0() * 28); g.rotate(R0() * 3);
      const kk = R0();
      g.fillStyle = kk < 0.35 ? "#6b4c2a" : kk < 0.6 ? "#555a5e" : kk < 0.8 ? "#1a1a1a" : "#7a2a22";
      if (kk >= 0.6 && kk < 0.8) { g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill(); g.fillStyle = "#333"; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); }
      else g.fillRect(-10, -3, 20, 6);
      g.restore();
    }
    g.fillStyle = "#ffcc00"; g.fillRect(x0 + 6, y0 + 16, 28, 4); g.fillStyle = "#111"; for (let k = 0; k < 4; k++) g.fillRect(x0 + 8 + k * 7, y0 + 16, 3, 4);
  } else if (d.style === "gate") {
    g.strokeStyle = "rgba(190,190,195,.8)"; g.lineWidth = 1.5;
    const hor = d.horiz;
    for (let k = 0; k < 8; k++) { g.beginPath(); if (hor) { g.moveTo(x0 + k * 5, y0 + 12); g.lineTo(x0 + k * 5 + 5, y0 + 26); } else { g.moveTo(x0 + 12, y0 + k * 5); g.lineTo(x0 + 26, y0 + k * 5 + 5); } g.stroke(); }
    g.fillStyle = "#8a8f94"; if (hor) g.fillRect(x0, y0 + 11, 40, 3); else g.fillRect(x0 + 11, y0, 3, 40);
    g.fillStyle = "#c9a34a"; g.fillRect(x0 + 17, y0 + 17, 6, 7);
  } else {
    const st = R.wallStyle[i] || m.theme.perim;
    g.fillStyle = "#3d4247"; g.fillRect(x0, y0 - WH, 40, 40 + WH - 2);
    g.fillStyle = "#555c62"; g.fillRect(x0 + 3, y0 - WH + 3, 34, 40 + WH - 8);
    g.fillStyle = "#ffcc00"; for (let k = 0; k < 5; k++) { g.save(); g.beginPath(); g.rect(x0 + 3, y0 + 26, 34, 6); g.clip(); g.translate(x0 + k * 10, y0 + 26); g.rotate(0.6); g.fillRect(0, -2, 5, 14); g.restore(); }
    g.fillStyle = "#222"; g.fillRect(x0 + 18, y0 - WH + 12, 4, 10);
  }
}

function debrisSprite(i) {
  return spr("debris" + i, 40, 40, (g) => {
    const R0 = rng(i * 13);
    g.fillStyle = "#2c2824"; g.fillRect(2, 4, 36, 34);
    for (let k = 0; k < 7; k++) {
      g.save(); g.translate(6 + R0() * 28, 6 + R0() * 28); g.rotate(R0() * 3);
      const kk = R0();
      g.fillStyle = kk < 0.35 ? "#6b4c2a" : kk < 0.6 ? "#555a5e" : kk < 0.8 ? "#1a1a1a" : "#7a2a22";
      if (kk >= 0.6 && kk < 0.8) { g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill(); g.fillStyle = "#333"; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); }
      else g.fillRect(-10, -3, 20, 6);
      g.restore();
    }
    g.fillStyle = "#ffcc00"; g.fillRect(6, 16, 28, 4); g.fillStyle = "#111"; for (let k = 0; k < 4; k++) g.fillRect(8 + k * 7, 16, 3, 4);
  });
}

function drawBoxSpot(g, G, x, y, t) {
  const B = G.z && G.z.box, m = G.map;
  const k = m.boxSpots.findIndex((s) => s.x === x && s.y === y);
  const x0 = x * TILE, y0 = y * TILE;
  if (!B || k !== B.spot || B.state === "gone") {
    // empty spot: chalky outline
    g.strokeStyle = "rgba(220,210,180,.18)"; g.lineWidth = 1.5; g.strokeRect(x0 + 4, y0 + 10, 32, 22);
    return;
  }
  const open = B.state === "spin" || B.state === "offer" || B.state === "skull";
  g.drawImage(boxSprite(open), x0 - 2, y0 + 4, 44, 26);
}

/* ---------------- props: top pass (over actors) ---------------- */
function drawPropsTop(g, G, tx0, ty0, tx1, ty1, t, V) {
  const m = G.map, T = TILE, W = m.W;
  const near = V.players.filter((p) => p && p.alive);
  for (let y = ty0; y <= ty1; y++) {
    let run = -1, runSt = null;
    const flush = (xEnd) => {
      if (run < 0) return;
      const x0 = run * T, w = (xEnd - run) * T;
      g.fillStyle = shade(runSt[1], -0.12); g.fillRect(x0, y * T - WH, w, T);
      g.fillStyle = wallCapPattern(runSt); g.fillRect(x0, y * T - WH, w, T);
      run = -1;
    };
    for (let x = tx0; x <= tx1 + 1; x++) {
      const i = y * W + x;
      const isWall = x <= tx1 && m.tile[i] === T_WALL;
      const st = isWall ? R.wallStyle[i] || m.theme.perim : null;
      if (isWall && run >= 0 && st === runSt) continue;
      flush(x);
      if (isWall) { run = x; runSt = st; }
    }
    // edges + details per wall tile
    for (let x = tx0; x <= tx1; x++) {
      const i = y * W + x; if (m.tile[i] !== T_WALL) continue;
      const x0 = x * T, y0 = y * T - WH;
      const wl = (dx, dy) => { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= m.H) return true; const tt = m.tile[yy * W + xx]; return tt === T_WALL || tt === T_WINDOW || (tt === T_DOOR && m.doors[m.obj[yy * W + xx]].style === "door" && !doorOpen(m, yy * W + xx)); };
      g.fillStyle = "rgba(255,255,255,.2)";
      if (!wl(0, -1)) g.fillRect(x0, y0, T, 3);
      if (!wl(-1, 0)) g.fillRect(x0, y0, 3, T);
      g.fillStyle = "rgba(0,0,0,.5)";
      if (!wl(0, 1)) g.fillRect(x0, y0 + T - 3, T, 3);
      if (!wl(1, 0)) g.fillRect(x0 + T - 3, y0, 3, T);
    }
    for (let x = tx0; x <= tx1; x++) {
      const i = y * W + x, c = m.ch[i], x0 = x * T, y0 = y * T;
      if (m.tile[i] === T_WINDOW) {
        const st = R.wallStyle[i] || m.theme.perim, w = m.windows[m.winAt[i]];
        g.fillStyle = shade(st[1], 0.04);
        if (w.ori === 0) { g.fillRect(x0, y0 - WH, 6, T); g.fillRect(x0 + 34, y0 - WH, 6, T); g.fillStyle = "rgba(180,200,220,.18)"; g.fillRect(x0 + 6, y0 - WH + 18, 28, 3); }
        else { g.fillRect(x0, y0 - WH, T, 6); g.fillRect(x0, y0 - WH + 34, T, 6); }
      }
      if (c === "T") {
        const s = treeCanopy(x * 5 + y, m.id === "outpost" ? "pine" : m.id === "farm" && hash2(x, y) < 0.3 ? "dead" : "oak");
        const under = near.some((p) => dist2(p.x, p.y, x0 + 20, y0 + 10) < 52 * 52);
        g.globalAlpha = under ? 0.4 : 0.95;
        const sway = Math.sin(t * 0.8 + x) * 1.5;
        g.drawImage(s, x0 + 20 - 48 + sway, y0 + 10 - 48 - WH * 0.7, 96, 96);
        g.globalAlpha = 1;
      }
      if (m.floor[i] === F_CORN && m.tile[i] === T_FLOOR) {
        const under = near.some((p) => dist2(p.x, p.y, x0 + 20, y0 + 20) < 60 * 60);
        g.globalAlpha = under ? 0.35 : 0.88;
        g.drawImage(R.cornSpr[(x * 7 + y * 3) % 3], x0 - 4, y0 - 10, 48, 48);
        g.globalAlpha = 1;
      }
      if (c === "L") g.drawImage(lampHead(), x0 + 8, y0 - WH - 6, 24, 24);
    }
  }
  // wall-gun chalk outlines
  for (const wb of m.wallbuys) {
    if (wb.x < tx0 - 1 || wb.x > tx1 + 1 || wb.y < ty0 - 1 || wb.y > ty1 + 1) continue;
    const fx = wb.x + wb.face[0], fy = wb.y + wb.face[1];
    const cx = (fx + 0.5) * TILE, cy = (fy + 0.5) * TILE - (m.tile[fy * W + fx] === T_WALL ? WH : WH * 0.6);
    const d = WEAPONS[wb.gun];
    g.save(); g.translate(cx - gunLen(d.cls) / 2, cy); g.scale(1, 1);
    g.globalAlpha = 0.85; g.strokeStyle = "#f1ece0"; g.lineWidth = 1.2;
    g.save(); g.globalCompositeOperation = "source-over"; g.fillStyle = "rgba(241,236,224,.18)"; drawGun(g, d.cls); g.restore();
    g.strokeRect(-14, -6, gunLen(d.cls) + 18, 12);
    g.restore();
    g.globalAlpha = 1;
    // price when someone's close
    if (near.some((p) => dist2(p.x, p.y, wb.wx, wb.wy) < 170 * 170)) {
      g.font = "600 8px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillStyle = "rgba(241,236,224,.9)";
      g.fillText(d.name.toUpperCase() + " · " + d.cost, cx, cy - 9);
    }
  }
  // door prices
  if (G.mode === "zombies") {
    g.font = "700 9px 'Chakra Petch', sans-serif"; g.textAlign = "center";
    for (const d of m.doors) {
      if (d.open) continue;
      if (!near.some((p) => dist2(p.x, p.y, d.cx, d.cy) < 230 * 230)) continue;
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(d.cx - 18, d.cy - WH - 14, 36, 12);
      g.fillStyle = "#ffd23f"; g.fillText(d.cost, d.cx, d.cy - WH - 5);
    }
  }
}

/* ---------------- projectiles, power-ups ---------------- */
function drawProjectile(g, p, t) {
  if (p.kind === "shell") {
    if (p.nuke) return;
    // airstrike: target marker
    const k = clamp(1 - p.t / 2, 0, 1);
    g.strokeStyle = rgba("#ff3b2a", 0.3 + 0.5 * Math.abs(Math.sin(t * 10))); g.lineWidth = 2;
    g.beginPath(); g.arc(p.x, p.y, p.r * (1.1 - k * 0.6), 0, TAU); g.stroke();
    return;
  }
  const h = p.h || 0;
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(p.x + 2, p.y + 3, 4, 3, 0, 0, TAU); g.fill();
  if (p.kind === "gl") { g.fillStyle = "#3a4a2a"; g.beginPath(); g.ellipse(p.x, p.y, 5, 3.5, Math.atan2(p.vy, p.vx), 0, TAU); g.fill(); return; }
  g.fillStyle = "#3d4a34"; g.beginPath(); g.arc(p.x, p.y - h * 0.15, 4.2, 0, TAU); g.fill();
  g.fillStyle = "#222"; g.fillRect(p.x - 1, p.y - h * 0.15 - 6, 2, 3);
  if (p.t < 0.6 && Math.sin(t * 40) > 0) { g.fillStyle = "#ff3b2a"; g.beginPath(); g.arc(p.x, p.y - h * 0.15, 1.6, 0, TAU); g.fill(); }
}
function drawPowerup(g, p, t) {
  const P = POWERUPS[p.type];
  const blink = p.t < 6 ? Math.sin(t * 16) > 0 : true;
  if (!blink) return;
  const bob = Math.sin(t * 3 + p.id) * 3;
  g.save(); g.translate(p.x, p.y + bob); g.rotate(Math.sin(t * 1.5) * 0.25);
  g.fillStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.ellipse(2, 10 - bob, 12, 5, 0, 0, TAU); g.fill();
  g.fillStyle = "#1a1a1a"; rr(g, -11, -11, 22, 22, 5); g.fill();
  g.strokeStyle = P.col; g.lineWidth = 2; rr(g, -11, -11, 22, 22, 5); g.stroke();
  g.fillStyle = P.col; g.font = "bold 12px 'Black Ops One', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText({ ammo: "▤", double: "x2", insta: "☠", nuke: "☢", barrier: "▦", sale: "$" }[p.type], 0, 1);
  g.restore();
}

/* ---------------- particles ---------------- */
function addPart(p) { if (R.parts.length > 700) R.parts.splice(0, 60); R.parts.push(p); return p; }
function stepParticles(G, dt) {
  for (const p of R.parts) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vz !== undefined) { p.z += p.vz * dt; p.vz -= (p.g || 400) * dt; if (p.z < 0) { p.z = 0; p.vz = -p.vz * 0.3; p.vx *= 0.6; p.vy *= 0.6; if (p.kind === "shell" && !p.landed) { p.landed = true; if (Math.random() < 0.4) SFX.play("casing", { x: p.x, y: p.y, v: 0.3 }); } } }
    const f = p.drag !== undefined ? p.drag : 3;
    p.vx *= Math.max(0, 1 - f * dt); p.vy *= Math.max(0, 1 - f * dt);
    if (p.grow) p.s += p.grow * dt;
    if (p.kind === "bloodDrop" && p.z === 0 && !p.splat) { p.splat = true; decalBlood(R, p.x, p.y, 1.5 + Math.random() * 2.5, Math.random() * 3); p.life = 0; }
  }
  R.parts = R.parts.filter((p) => p.life > 0);
  for (const c of R.corpses) c.t -= dt;
  R.corpses = R.corpses.filter((c) => c.t > 0);
  for (const a of [R.tracers, R.flashes, R.booms, R.arcs]) for (const e of a) e.t -= dt;
  R.tracers = R.tracers.filter((e) => e.t > 0); R.flashes = R.flashes.filter((e) => e.t > 0); R.booms = R.booms.filter((e) => e.t > 0); R.arcs = R.arcs.filter((e) => e.t > 0);
  if (R.lightning > 0) R.lightning -= dt;
}
function drawParticles(g, G, layer, x0, y0, x1, y1) {
  for (const p of R.parts) {
    if ((p.layer || "air") !== layer) continue;
    if (p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
    const a = clamp(p.life / p.max, 0, 1);
    const y = p.y - (p.z || 0) * 0.3;
    switch (p.kind) {
      case "smoke": g.fillStyle = rgba(p.c || "#8a8a8a", 0.35 * a); g.beginPath(); g.arc(p.x, y, p.s, 0, TAU); g.fill(); break;
      case "dust": g.fillStyle = rgba(p.c || "#b8a888", 0.5 * a); g.beginPath(); g.arc(p.x, y, p.s, 0, TAU); g.fill(); break;
      case "ash": g.fillStyle = rgba("#2e2c2a", 0.8 * a); g.fillRect(p.x, y, p.s, p.s); break;
      case "debris": g.fillStyle = p.c || "#4a4a46"; g.fillRect(p.x - p.s / 2, y - p.s / 2, p.s, p.s); break;
      case "shell": g.save(); g.translate(p.x, y); g.rotate(p.rot += p.vr * 0.016); g.fillStyle = p.c || "#c9a34a"; g.fillRect(-2.2, -0.9, 4.4, 1.8); g.restore(); break;
      case "bloodDrop": case "mist": g.fillStyle = rgba(p.kind === "mist" ? "#6a0808" : "#7a0a0a", (p.kind === "mist" ? 0.45 : 0.9) * a); g.beginPath(); g.arc(p.x, y, p.s, 0, TAU); g.fill(); break;
      case "gib": g.fillStyle = p.c || "#5a1010"; g.beginPath(); g.ellipse(p.x, y, p.s, p.s * 0.7, p.x, 0, TAU); g.fill(); break;
      case "splash": g.strokeStyle = rgba("#a8c0d8", 0.5 * a); g.lineWidth = 0.8; g.beginPath(); g.arc(p.x, p.y, (1 - a) * 6 + 1, 0, TAU); g.stroke(); break;
      case "board": g.save(); g.translate(p.x, y); g.rotate(p.rot += p.vr * 0.016); g.fillStyle = "#7a5630"; g.fillRect(-9, -2.5, 18, 5); g.restore(); break;
      case "dirt": g.fillStyle = rgba("#4a3a26", a); g.beginPath(); g.arc(p.x, y, p.s, 0, TAU); g.fill(); break;
    }
  }
}

/* ---------------- lighting ---------------- */
function drawLighting(ctx, G, V, t, shake) {
  const th = G.map.theme;
  let dark = th.dark;
  if (G.z && G.z.power) dark *= 0.93;
  if (R.lightning > 0) dark *= 1 - clamp(R.lightning * 3, 0, 0.85);
  if (dark <= 0.02) return;
  const s = 0.5, w = Math.ceil(V.w * s), h = Math.ceil(V.h * s);
  if (R.lightC.width !== w || R.lightC.height !== h) { R.lightC.width = w; R.lightC.height = h; }
  const g = R.lightG, z = V.cam.z * s;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  g.fillStyle = rgba(th.amb, dark); g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-out";
  g.setTransform(z, 0, 0, z, w / 2 + shake[0] * s - V.cam.x * z, h / 2 + shake[1] * s - V.cam.y * z);
  const [wx0, wy0, wx1, wy1] = V.wr;
  const inView = (x, y, r) => x > wx0 - r && x < wx1 + r && y > wy0 - r && y < wy1 + r;
  const radial = (x, y, r, a) => {
    if (!inView(x, y, r)) return;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  };
  const m = G.map;
  // flashlights (with shadows)
  for (const a of G.actors) {
    if (a.kind !== "soldier" || !a.alive) continue;
    const range = a.human ? 640 : 460;
    if (!inView(a.x, a.y, range)) continue;
    radial(a.x, a.y, a.human ? 170 : 80, a.human ? 0.9 : 0.6);
    if (a.down) continue;
    const pts = [], N = 32, spread = a.human ? 0.58 : 0.45;
    for (let k = 0; k <= N; k++) {
      const an = a.ang - spread + (2 * spread * k) / N;
      const ux = Math.cos(an), uy = Math.sin(an);
      const r = rayGrid(m, a.x, a.y, ux, uy, range, m.light);
      const d = r.i === -1 ? range : r.d + 8;
      pts.push(a.x + ux * d, a.y + uy * d);
    }
    const grd = g.createRadialGradient(a.x, a.y, 10, a.x, a.y, range);
    grd.addColorStop(0, "rgba(0,0,0,.95)"); grd.addColorStop(0.55, "rgba(0,0,0,.65)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.moveTo(a.x, a.y);
    for (let k = 0; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
    g.closePath(); g.fill();
  }
  // lamps (on after the power comes on in zombies; always on in Team Deathmatch)
  const bright = !G.z || G.z.power;
  for (const L of m.lamps) radial(L.wx, L.wy, bright ? 260 : 210, bright ? 0.85 : 0.7);
  for (const f of R.flashes) radial(f.x, f.y, 150 * f.s, 0.9 * (f.t / f.max));
  for (const b of R.booms) radial(b.x, b.y, b.r * 2.2, 0.95 * (b.t / b.max));
  for (const p of G.powerups) radial(p.x, p.y, 70, 0.6);
  if (G.z) {
    const B = G.z.box, bs = m.boxSpots[B.spot];
    if (bs && B.state !== "gone") radial(bs.wx, bs.wy, 120, 0.7);
    if (G.z.power) { for (const p of m.perks) if (!p.gone) radial(p.wx, p.wy, 90, 0.6); if (m.forge) radial(m.forge.wx, m.forge.wy, 110, 0.7); }
  }
  for (const a of R.arcs) for (const p of a.pts) radial(p[0], p[1], 90, 0.6 * (a.t / a.max));
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(R.lightC, V.x0, V.y0, V.w, V.h);
}

/* ---------------- glow pass (additive) ---------------- */
function drawGlow(g, G, V, t) {
  const m = G.map;
  g.save();
  g.globalCompositeOperation = "lighter";
  // tracers
  for (const tr of R.tracers) {
    const a = tr.t / tr.max;
    g.strokeStyle = rgba(tr.c || "#ffe2a0", 0.75 * a); g.lineWidth = tr.w;
    const fx = lerp(tr.x0, tr.x1, Math.max(0, 1 - a * 1.6)), fy = lerp(tr.y0, tr.y1, Math.max(0, 1 - a * 1.6));
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(tr.x1, tr.y1); g.stroke();
  }
  // muzzle flashes
  for (const f of R.flashes) {
    const a = f.t / f.max;
    g.save(); g.translate(f.x, f.y); g.rotate(f.a);
    const grd = g.createRadialGradient(4, 0, 0, 4, 0, 18 * f.s);
    grd.addColorStop(0, `rgba(255,240,200,${a})`); grd.addColorStop(0.4, rgba(f.c || "#ffaa3a", 0.7 * a)); grd.addColorStop(1, "rgba(255,120,30,0)");
    g.fillStyle = grd; g.beginPath(); g.ellipse(6 * f.s, 0, 18 * f.s, 8 * f.s, 0, 0, TAU); g.fill();
    g.restore();
  }
  // explosions
  for (const b of R.booms) {
    const a = b.t / b.max, r = b.r * (1.2 - a * 0.5);
    const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    grd.addColorStop(0, `rgba(255,240,200,${a})`); grd.addColorStop(0.35, `rgba(255,150,40,${0.8 * a})`); grd.addColorStop(1, "rgba(120,30,0,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(b.x, b.y, r, 0, TAU); g.fill();
  }
  // volt arcs
  for (const arc of R.arcs) {
    const a = arc.t / arc.max;
    g.strokeStyle = `rgba(150,220,255,${a})`; g.lineWidth = 2.2;
    g.beginPath();
    for (let k = 0; k < arc.pts.length - 1; k++) {
      const [x0, y0] = arc.pts[k], [x1, y1] = arc.pts[k + 1];
      g.moveTo(x0, y0);
      for (let s = 1; s <= 6; s++) g.lineTo(lerp(x0, x1, s / 6) + (s < 6 ? (Math.random() - 0.5) * 16 : 0), lerp(y0, y1, s / 6) + (s < 6 ? (Math.random() - 0.5) * 16 : 0));
    }
    g.stroke();
  }
  // zombie eyes
  for (const z of G.actors) {
    if (z.kind !== "zombie" || !z.alive || !z.eyes || z.rise > 0.7) continue;
    if (z.x < V.wr[0] || z.x > V.wr[2] || z.y < V.wr[1] || z.y > V.wr[3]) continue;
    const col = z.ztype === "hound" ? "255,90,30" : z.ztype === "brute" ? "255,40,40" : "255,200,60";
    for (let k = 0; k < 4; k += 2) {
      const grd = g.createRadialGradient(z.eyes[k], z.eyes[k + 1], 0, z.eyes[k], z.eyes[k + 1], 3.2);
      grd.addColorStop(0, `rgba(${col},.9)`); grd.addColorStop(0.5, `rgba(${col},.35)`); grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(z.eyes[k], z.eyes[k + 1], 3.2, 0, TAU); g.fill();
    }
  }
  // perk machines + forge + box beam
  if (G.z) {
    if (G.z.power) for (const p of m.perks) { if (p.gone) continue; const grd = g.createRadialGradient(p.wx, p.wy - 6, 0, p.wx, p.wy - 6, 34); grd.addColorStop(0, rgba(PERKS[p.perk].col, 0.4 + Math.sin(t * 3 + p.x) * 0.1)); grd.addColorStop(1, rgba(PERKS[p.perk].col, 0)); g.fillStyle = grd; g.beginPath(); g.arc(p.wx, p.wy - 6, 34, 0, TAU); g.fill(); }
    const B = G.z.box, bs = m.boxSpots[B.spot];
    if (bs && B.state !== "gone") {
      const grd = g.createLinearGradient(bs.wx, bs.wy - 120, bs.wx, bs.wy);
      grd.addColorStop(0, "rgba(140,200,255,0)"); grd.addColorStop(1, `rgba(140,200,255,${0.22 + Math.sin(t * 2) * 0.06})`);
      g.fillStyle = grd; g.fillRect(bs.wx - 10, bs.wy - 120, 20, 120);
      if (B.state === "spin" || B.state === "offer") {
        const wid = B.state === "spin" ? WEAPON_IDS[Math.floor(t * 9) % WEAPON_IDS.length] : B.wid;
        const d = WEAPONS[wid];
        g.globalCompositeOperation = "source-over";
        g.save(); g.translate(bs.wx - gunLen(d.cls) / 2, bs.wy - 22 - (B.state === "offer" ? Math.sin(t * 2) * 3 : 0)); g.scale(1.3, 1.3); drawGun(g, d.cls); g.restore();
        if (B.state === "offer") { g.font = "700 8px 'Chakra Petch', sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText(d.name.toUpperCase(), bs.wx, bs.wy - 36); }
        g.globalCompositeOperation = "lighter";
      }
      if (B.state === "skull") { g.globalCompositeOperation = "source-over"; g.font = "28px serif"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText("☠", bs.wx, bs.wy - 26 - (2.4 - B.t) * 30); g.globalCompositeOperation = "lighter"; }
    }
    if (G.z.power && m.forge) { const f = m.forge, grd = g.createRadialGradient(f.wx, f.wy, 0, f.wx, f.wy, 40); grd.addColorStop(0, `rgba(255,140,40,${0.45 + Math.sin(t * 5) * 0.12})`); grd.addColorStop(1, "rgba(255,140,40,0)"); g.fillStyle = grd; g.beginPath(); g.arc(f.wx, f.wy, 40, 0, TAU); g.fill(); }
  }
  // lamp bulbs
  for (const L of m.lamps) { const grd = g.createRadialGradient(L.wx, L.wy - WH - 2, 0, L.wx, L.wy - WH - 2, 22); grd.addColorStop(0, rgba(m.theme.lamp, 0.55)); grd.addColorStop(1, rgba(m.theme.lamp, 0)); g.fillStyle = grd; g.beginPath(); g.arc(L.wx, L.wy - WH - 2, 22, 0, TAU); g.fill(); }
  // power-up glow
  for (const p of G.powerups) { const P = POWERUPS[p.type]; const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34); grd.addColorStop(0, rgba(P.col, 0.5)); grd.addColorStop(1, rgba(P.col, 0)); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, 34, 0, TAU); g.fill(); }
  // sparks
  for (const p of R.parts) {
    if (p.kind !== "spark" && p.kind !== "fire" && p.kind !== "ember") continue;
    const a = clamp(p.life / p.max, 0, 1);
    if (p.kind === "spark") { g.strokeStyle = `rgba(255,${180 + (p.c || 0)},80,${a})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); g.stroke(); }
    else { const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s); grd.addColorStop(0, `rgba(255,170,60,${a * (p.kind === "ember" ? 0.8 : 0.6)})`); grd.addColorStop(1, "rgba(255,80,20,0)"); g.fillStyle = grd; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
  }
  // laser sights for local players
  for (const p of V.players) {
    if (!p || !p.alive || p.down || p.reloadT > 0) continue;
    const aiming = p.human && Input.aimActive && Input.aimActive[p.pidx];
    if (!aiming) continue;
    const ux = Math.cos(p.ang), uy = Math.sin(p.ang);
    const r = rayGrid(m, p.x, p.y, ux, uy, 420, m.shot);
    const grd = g.createLinearGradient(p.x, p.y, p.x + ux * r.d, p.y + uy * r.d);
    grd.addColorStop(0, "rgba(255,40,40,.5)"); grd.addColorStop(1, "rgba(255,40,40,0)");
    g.strokeStyle = grd; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x + ux * 20, p.y + uy * 20); g.lineTo(p.x + ux * r.d, p.y + uy * r.d); g.stroke();
  }
  g.restore();
}

/* ---------------- weather ---------------- */
function drawWeather(ctx, G, V, t, dt) {
  const th = G.map.theme;
  if (th.weather === "rain") {
    ctx.save();
    ctx.strokeStyle = "rgba(170,190,220,.28)"; ctx.lineWidth = 1;
    ctx.beginPath();
    const n = Math.floor((V.w * V.h) / 4500);
    for (let k = 0; k < n; k++) {
      const sx = V.x0 + ((k * 97.3 + t * 260 + (k % 7) * 31) % (V.w + 60)) - 30, sy = V.y0 + ((k * 61.7 + t * 900 * (0.8 + (k % 5) * 0.08)) % (V.h + 40)) - 20;
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 4, sy + 14);
    }
    ctx.stroke(); ctx.restore();
    // splashes on the ground near the camera
    R.rainT += dt;
    while (R.rainT > 0.02) { R.rainT -= 0.02; const [x0, y0, x1, y1] = V.wr; addPart({ kind: "splash", layer: "floor", x: rnd(x0, x1), y: rnd(y0, y1), vx: 0, vy: 0, life: 0.35, max: 0.35 }); }
    if (Math.random() < dt * 0.05) { R.lightning = 0.35; setTimeout(() => SFX.play("thunder", { v: 0.8 }), 400 + Math.random() * 1200); }
  } else if (th.weather === "embers") {
    R.rainT += dt;
    while (R.rainT > 0.08) { R.rainT -= 0.08; const [x0, y0, x1, y1] = V.wr; addPart({ kind: "ember", x: rnd(x0, x1), y: rnd(y0, y1), vx: rnd(-10, 25), vy: rnd(-30, -10), s: rnd(2, 4), life: rnd(1.5, 3), max: 3, drag: 0 }); }
  }
  // colour grade
  ctx.save(); ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = rgba(th.grade[0], th.grade[1]); ctx.fillRect(V.x0, V.y0, V.w, V.h); ctx.restore();
  // vignette
  const vg = ctx.createRadialGradient(V.x0 + V.w / 2, V.y0 + V.h / 2, Math.min(V.w, V.h) * 0.35, V.x0 + V.w / 2, V.y0 + V.h / 2, Math.max(V.w, V.h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = vg; ctx.fillRect(V.x0, V.y0, V.w, V.h);
}

function drawFog(ctx, G, V, t) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  const z = V.cam.z, S = 256 * 2.4;
  ctx.translate(V.x0, V.y0);
  for (let layer = 0; layer < 2; layer++) {
    const ox = (((-(V.cam.x * z) * (0.95 + layer * 0.08) - t * (9 + layer * 7)) % S) + S) % S, oy = (((-(V.cam.y * z) * (0.95 + layer * 0.08)) % S) + S) % S;
    for (let x = ox - S; x < V.w + S; x += S) for (let y = oy - S; y < V.h + S; y += S) ctx.drawImage(R.fogC, x, y, S, S);
  }
  ctx.restore();
}

function drawHurt(ctx, G, V, me, t) {
  const k = clamp(1 - me.hp / me.maxHp, 0, 1);
  const recent = clamp(1 - (G.time - me.hurtT) / 0.6, 0, 1);
  const a = Math.max(k * 0.65, recent * 0.5) * (me.alive ? 1 : 0.8);
  if (me.down) {
    ctx.fillStyle = "rgba(90,0,0,.28)"; ctx.fillRect(V.x0, V.y0, V.w, V.h);
  }
  if (a < 0.02) return;
  const grd = ctx.createRadialGradient(V.x0 + V.w / 2, V.y0 + V.h / 2, Math.min(V.w, V.h) * 0.3, V.x0 + V.w / 2, V.y0 + V.h / 2, Math.max(V.w, V.h) * 0.62);
  grd.addColorStop(0, "rgba(140,0,0,0)"); grd.addColorStop(1, `rgba(150,0,0,${a})`);
  ctx.fillStyle = grd; ctx.fillRect(V.x0, V.y0, V.w, V.h);
  // which way the hit came from
  const P = V.players[0], arr = R.dmgDir[P.pidx >= 0 ? P.pidx : 0] || [];
  for (const d of arr) {
    const age = G.time - d.t; if (age > 1.2) continue;
    const aa = Math.atan2(d.y - P.y, d.x - P.x);
    const cx = V.x0 + V.w / 2, cy = V.y0 + V.h / 2, rr0 = Math.min(V.w, V.h) * 0.32;
    ctx.strokeStyle = `rgba(255,40,30,${0.7 * (1 - age / 1.2)})`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, rr0, aa - 0.3, aa + 0.3); ctx.stroke();
  }
}

/* ---------------- events from the simulation → effects + sound ---------------- */
function fxEvent(G, e, views) {
  const local = (id) => views.some((V) => V.players.some((p) => p && p.id === id));
  const vol = (x, y) => SFX.spatial(x, y);
  switch (e.k) {
    case "snd": SFX.play(e.s, e); break;
    case "flash": R.flashes.push({ x: e.x, y: e.y, a: e.a, s: e.s, c: e.c, t: 0.05, max: 0.05 }); break;
    case "tracer": R.tracers.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, c: e.c, w: e.w, t: 0.07, max: 0.07 }); break;
    case "shell": addPart({ kind: "shell", layer: "floor", x: e.x, y: e.y, vx: Math.cos(e.a + 1.6) * rnd(60, 110) + rnd(-15, 15), vy: Math.sin(e.a + 1.6) * rnd(60, 110), z: 12, vz: rnd(60, 120), g: 500, rot: rnd(TAU), vr: rnd(-30, 30), life: 3.5, max: 3.5, drag: 2, c: e.sg ? "#a8281e" : "#c9a34a" }); break;
    case "impact": impactFx(e); break;
    case "boom": {
      R.booms.push({ x: e.x, y: e.y, r: e.r * (e.kind === "pistolboom" ? 0.6 : 1), t: 0.35, max: 0.35 });
      if (e.kind !== "pistolboom") { decalScorch(R, e.x, e.y, e.r * 0.55); for (let k = 0; k < 14; k++) addPart({ kind: "smoke", x: e.x + rnd(-20, 20), y: e.y + rnd(-20, 20), vx: rnd(-60, 60), vy: rnd(-60, 60), s: rnd(12, 26), grow: 18, life: rnd(1.2, 2.4), max: 2.4, drag: 1.5, c: "#5a5550" });
        for (let k = 0; k < 18; k++) addPart({ kind: "spark", x: e.x, y: e.y, vx: rnd(-400, 400), vy: rnd(-400, 400), life: rnd(0.2, 0.6), max: 0.6, drag: 2 });
        for (let k = 0; k < 10; k++) addPart({ kind: "debris", x: e.x, y: e.y, vx: rnd(-260, 260), vy: rnd(-260, 260), z: 0, vz: rnd(150, 350), s: rnd(2, 4), life: 2, max: 2, drag: 1.2, c: "#3a3530" }); }
      SFX.play(e.kind === "pistolboom" ? "pop" : "boom", e);
      for (const V of views) { const p = V.cam; if (p && dist(p.x, p.y, e.x, e.y) < 900) V.shake.a = Math.max(V.shake.a, (e.kind === "pistolboom" ? 2 : 9) * (1 - dist(p.x, p.y, e.x, e.y) / 900)); }
      break;
    }
    case "arc": R.arcs.push({ pts: e.pts, t: 0.18, max: 0.18 }); SFX.play("zap", { x: e.pts[0][0], y: e.pts[0][1] }); break;
    case "die": {
      if (e.zt) {
        if (GRITTY()) {
          R.corpses.push({ x: e.x, y: e.y, a: e.a, look: e.look, zt: e.zt, gib: e.gib, t: 14 });
          decalBlood(R, e.x + Math.cos(e.a) * 6, e.y + Math.sin(e.a) * 6, e.zt === "brute" ? 18 : 11, e.a);
          if (e.gib) for (let k = 0; k < 8; k++) addPart({ kind: "gib", x: e.x, y: e.y, vx: rnd(-200, 200), vy: rnd(-200, 200), z: 0, vz: rnd(100, 260), s: rnd(2, 4), life: 6, max: 6, drag: 2, layer: "floor" });
          for (let k = 0; k < 8; k++) addPart({ kind: "bloodDrop", x: e.x, y: e.y, vx: Math.cos(e.a) * rnd(40, 180) + rnd(-50, 50), vy: Math.sin(e.a) * rnd(40, 180) + rnd(-50, 50), z: 10, vz: rnd(40, 120), s: rnd(1.2, 2.4), life: 2, max: 2, drag: 1 });
        } else {
          // standard style: crumbles into ash
          decalAsh(R, e.x, e.y, e.zt === "brute" ? 16 : 10);
          for (let k = 0; k < 18; k++) addPart({ kind: "ash", x: e.x + rnd(-10, 10), y: e.y + rnd(-10, 10), vx: rnd(-40, 40), vy: rnd(-70, -10), s: rnd(1.5, 3), life: rnd(0.6, 1.4), max: 1.4, drag: 1.5 });
          for (let k = 0; k < 4; k++) addPart({ kind: "smoke", x: e.x, y: e.y, vx: rnd(-20, 20), vy: rnd(-30, 0), s: rnd(8, 14), grow: 10, life: 1, max: 1, c: "#3a3836" });
        }
        if (e.zt === "exploder") for (let k = 0; k < 20; k++) addPart({ kind: "smoke", x: e.x, y: e.y, vx: rnd(-90, 90), vy: rnd(-90, 90), s: rnd(10, 20), grow: 22, life: 1.5, max: 1.5, c: "#6a8a2a" });
        SFX.play(e.zt === "hound" ? "yelp" : "zdie", e);
      } else {
        R.corpses.push({ x: e.x, y: e.y, a: e.a, soldier: true, op: e.op, t: GRITTY() ? 10 : 2.5 });
        if (GRITTY()) decalBlood(R, e.x, e.y, 12, e.a);
        else for (let k = 0; k < 6; k++) addPart({ kind: "dust", x: e.x, y: e.y, vx: rnd(-60, 60), vy: rnd(-60, 60), s: rnd(4, 8), life: 0.8, max: 0.8 });
        SFX.play("die", e);
      }
      break;
    }
    case "zhit": {
      const z = G.actors.find((a) => a.id === e.id); if (z) z.flash = 0.06;
      break;
    }
    case "hurt": {
      for (const V of views) for (const p of V.players) if (p && p.id === e.id) {
        V.shake.a = Math.max(V.shake.a, 4);
        if (e.from) { (R.dmgDir[p.pidx >= 0 ? p.pidx : 0] = R.dmgDir[p.pidx >= 0 ? p.pidx : 0] || []).push({ x: e.from[0], y: e.from[1], t: G.time }); if (R.dmgDir[p.pidx >= 0 ? p.pidx : 0].length > 4) R.dmgDir[p.pidx >= 0 ? p.pidx : 0].shift(); }
        SFX.play("hurt", { v: 1 });
      }
      if (GRITTY()) for (let k = 0; k < 4; k++) addPart({ kind: "mist", x: e.x, y: e.y, vx: Math.cos(e.a) * rnd(40, 120) + rnd(-30, 30), vy: Math.sin(e.a) * rnd(40, 120) + rnd(-30, 30), s: rnd(2, 4), life: 0.4, max: 0.4 });
      break;
    }
    case "rise": for (let k = 0; k < 10; k++) addPart({ kind: "dirt", x: e.x, y: e.y, vx: rnd(-80, 80), vy: rnd(-80, 80), z: 0, vz: rnd(80, 160), s: rnd(1.5, 3), life: 0.9, max: 0.9, drag: 1.5 }); SFX.play("dirt", e); break;
    case "lightning": R.lightning = 0.25; R.booms.push({ x: e.x, y: e.y, r: 60, t: 0.25, max: 0.25 }); SFX.play("zap", e); decalScorch(R, e.x, e.y, 18); break;
    case "board": {
      if (e.fix) { SFX.play("hammer", e); }
      else if (!e.quiet) { SFX.play("boardbreak", e); addPart({ kind: "board", x: e.x, y: e.y, vx: rnd(-90, 90), vy: rnd(-90, 90), z: 10, vz: rnd(60, 140), rot: rnd(TAU), vr: rnd(-20, 20), life: 1.6, max: 1.6, drag: 1.5, layer: "floor" }); }
      break;
    }
    case "barrel": break;
    case "door": SFX.play(e.style === "debris" ? "debris" : "door", e); for (let k = 0; k < 14; k++) addPart({ kind: "dust", x: e.x + rnd(-30, 30), y: e.y + rnd(-30, 30), vx: rnd(-50, 50), vy: rnd(-50, 50), s: rnd(6, 12), grow: 8, life: 1.2, max: 1.2 }); break;
    case "pts": for (const V of views) for (const p of V.players) if (p && p.id === e.pid) R.pops.push({ pid: p.pidx >= 0 ? p.pidx : 0, n: e.n, t: 1.1 }); break;
    case "toast": R.toasts.push({ pid: e.pid, t: e.t, life: 2.2 }); if (R.toasts.length > 4) R.toasts.shift(); break;
    case "round": R.announce = { t: "ROUND " + e.n, sub: e.hound ? "THE HOUNDS ARE COMING" : e.n === 1 ? "SURVIVE" : "", life: 2.6, max: 2.6, col: "#c8231b" }; SFX.play(e.hound ? "houndround" : "roundstart"); break;
    case "roundEnd": SFX.play("roundend"); break;
    case "pu_spawn": SFX.play("puspawn", e); break;
    case "pu_take": R.announce = { t: POWERUPS[e.t].name, sub: "", life: 1.8, max: 1.8, col: POWERUPS[e.t].col }; SFX.play("pu_" + e.t); if (e.t === "nuke") { R.lightning = 0.5; for (const V of views) V.shake.a = 10; } break;
    case "pu_end": break;
    case "perk": SFX.play("perk", e); R.toasts.push({ pid: e.pid, t: PERKS[e.p].name, life: 2.5 }); break;
    case "power": R.announce = { t: "POWER ON", sub: "PERKS AND THE FORGE ARE ONLINE", life: 3, max: 3, col: "#ffd23f" }; SFX.play("power"); R.lightning = 0.2; break;
    case "forged": SFX.play("forged", e); R.toasts.push({ pid: e.pid, t: "FORGED: " + e.w.toUpperCase(), life: 3 }); for (let k = 0; k < 30; k++) addPart({ kind: "spark", x: e.x, y: e.y, vx: rnd(-300, 300), vy: rnd(-300, 300), life: 0.8, max: 0.8 }); break;
    case "spark": for (let k = 0; k < 4; k++) addPart({ kind: "spark", x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-200, 200), vy: rnd(-260, 40), life: 0.4, max: 0.4 }); if (Math.random() < 0.3) SFX.play("anvil", e); break;
    case "boxspin": SFX.play("box", e); break;
    case "boxmove": R.toasts.push({ t: "THE MYSTERY BOX HAS MOVED", life: 3 }); break;
    case "down": SFX.play("down"); R.toasts.push({ t: (G.actors.find((a) => a.id === e.id) || {}).name + (e.self ? " · SECOND WIND!" : " IS DOWN"), life: 3 }); break;
    case "dead": SFX.play("die"); break;
    case "revived": SFX.play("revive"); break;
    case "drop": break;
    case "feed": R.feed.push({ e, life: 5 }); if (R.feed.length > 4) R.feed.shift(); for (const V of views) for (const p of V.players) if (p && p.id === e.ak) { R.kill[p.pidx >= 0 ? p.pidx : 0] = 0.6; SFX.play("killtick"); } break;
    case "streak": {
      const mine = views.some((V) => V.players.some((p) => p && p.team === e.team));
      if (mine) { R.announce = { t: e.name, sub: e.by.toUpperCase(), life: 2.2, max: 2.2, col: TEAM_COL[e.team] }; SFX.play("streak"); }
      else { R.toasts.push({ t: "ENEMY " + e.name, life: 2.5 }); SFX.play("incoming", { v: 0.6 }); }
      break;
    }
    case "airwarn": SFX.play("incoming", e); break;
    case "spawn": break;
    case "gameover": break;
    case "swipe": SFX.play("swipe", e); break;
    case "hitmark": for (const V of views) for (const p of V.players) if (p && p.id === e.pid) { const k = p.pidx >= 0 ? p.pidx : 0; if (e.kill) R.kill[k] = 0.5; else R.hit[k] = 0.18; if (!e.kill) SFX.play("hittick", { v: 0.6 }); } break;
  }
}

function impactFx(e) {
  const back = e.a + Math.PI;
  switch (e.m) {
    case "zombie": case "flesh":
      if (GRITTY()) {
        for (let k = 0; k < (e.crit ? 7 : 3); k++) addPart({ kind: "mist", x: e.x, y: e.y, vx: Math.cos(e.a) * rnd(60, 180) + rnd(-40, 40), vy: Math.sin(e.a) * rnd(60, 180) + rnd(-40, 40), s: rnd(1.5, 3.5), life: 0.35, max: 0.35 });
        if (Math.random() < 0.5) addPart({ kind: "bloodDrop", x: e.x, y: e.y, vx: Math.cos(e.a) * rnd(60, 160), vy: Math.sin(e.a) * rnd(60, 160), z: 8, vz: rnd(30, 90), s: 1.6, life: 1.5, max: 1.5, drag: 1 });
      } else for (let k = 0; k < 3; k++) addPart({ kind: "dust", x: e.x, y: e.y, vx: Math.cos(back) * rnd(30, 90) + rnd(-30, 30), vy: Math.sin(back) * rnd(30, 90) + rnd(-30, 30), s: rnd(2, 4), life: 0.35, max: 0.35, c: e.m === "zombie" ? "#7a8a60" : "#c8b8a0" });
      SFX.play("flesh", { x: e.x, y: e.y, v: 0.5 });
      if (e.crit) SFX.play("crit", { x: e.x, y: e.y, v: 0.7 });
      break;
    case "metal": for (let k = 0; k < 5; k++) addPart({ kind: "spark", x: e.x, y: e.y, vx: Math.cos(back) * rnd(80, 260) + rnd(-90, 90), vy: Math.sin(back) * rnd(80, 260) + rnd(-90, 90), life: rnd(0.1, 0.3), max: 0.3, drag: 2 }); SFX.play("ric", { x: e.x, y: e.y, v: 0.35 }); break;
    case "wood": for (let k = 0; k < 4; k++) addPart({ kind: "debris", x: e.x, y: e.y, vx: Math.cos(back) * rnd(50, 150) + rnd(-60, 60), vy: Math.sin(back) * rnd(50, 150) + rnd(-60, 60), z: 4, vz: rnd(40, 100), s: rnd(1.5, 3), life: 0.8, max: 0.8, c: "#7a5630" }); break;
    case "sand": for (let k = 0; k < 4; k++) addPart({ kind: "dust", x: e.x, y: e.y, vx: Math.cos(back) * rnd(40, 100) + rnd(-40, 40), vy: Math.sin(back) * rnd(40, 100) + rnd(-40, 40), s: rnd(2, 5), life: 0.5, max: 0.5, c: "#b8a070" }); break;
    case "ground": for (let k = 0; k < 2; k++) addPart({ kind: "dust", x: e.x, y: e.y, vx: rnd(-40, 40), vy: rnd(-40, 40), s: rnd(2, 4), life: 0.4, max: 0.4 }); decalHole(R, e.x, e.y); break;
    default:
      for (let k = 0; k < 3; k++) addPart({ kind: "dust", x: e.x, y: e.y, vx: Math.cos(back) * rnd(40, 120) + rnd(-40, 40), vy: Math.sin(back) * rnd(40, 120) + rnd(-40, 40), s: rnd(2, 4), life: 0.45, max: 0.45, c: "#9a958a" });
      if (Math.random() < 0.6) addPart({ kind: "spark", x: e.x, y: e.y, vx: Math.cos(back) * rnd(80, 200), vy: Math.sin(back) * rnd(80, 200), life: 0.12, max: 0.12, c: 40 });
      SFX.play("hitwall", { x: e.x, y: e.y, v: 0.3 });
  }
}
