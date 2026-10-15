/* Art drawn in code: baked ground textures, walls, props, soldiers, zombies, guns, icons. No image files.
   World units: 1 tile = 40. Props are pre-rendered into small canvases at SPR_RES pixels per unit for crispness. */

const SPR_RES = 2;
const WH = 20;           // how tall walls look (their top is drawn this far up the screen)
const CHAR_SCALE = 1.22; // characters are drawn a little bigger than their collision circle so they read on a phone

/* ---------------- ground bake ---------------- */
function bakeGround(m) {
  const th = m.theme, W = m.pw, H = m.ph;
  const c = makeCanvas(W, H), g = c.getContext("2d");
  const R = rng(m.id.length * 977 + 13);
  const T = TILE;
  const indoorKinds = { outpost: ["concrete", "concrete", "metalfloor"], downtown: ["checker", "tile", "wood", "tile"], farm: ["wood", "wood", "dirtfloor"] }[m.id] || ["concrete"];
  const areaKind = (i) => { const a = m.area[i]; return a < 0 ? indoorKinds[0] : indoorKinds[(a * 7 + 3) % indoorKinds.length]; };
  m.indoorKind = areaKind;
  // 1) base colour per tile
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x, f = m.floor[i], hh = hash2(x, y, 5);
    let col;
    if (f === F_OUT || f === F_CORN) col = f === F_CORN ? "#4d3f2c" : th.out.v[Math.floor(hh * th.out.v.length)];
    else if (f === F_IN) { const k = areaKind(i); col = k === "wood" ? th.in.v[Math.floor(hh * th.in.v.length)] : k === "checker" ? "#cfc7b4" : k === "tile" ? "#8a8a84" : k === "metalfloor" ? "#4c524f" : k === "dirtfloor" ? "#5a4733" : th.in.v[Math.floor(hh * th.in.v.length)]; }
    else if (f === F_ROAD) col = shade(th.road, (hh - 0.5) * 0.06);
    else if (f === F_PAVE) col = shade(th.pave, (hh - 0.5) * 0.08);
    else col = "#2e3e4a";
    g.fillStyle = col; g.fillRect(x * T, y * T, T, T);
  }
  // 2) soft blotches so tiles don't look like a grid
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x, f = m.floor[i];
    const n = f === F_OUT ? 6 : f === F_IN ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const px = (x + R()) * T, py = (y + R()) * T, rr = 6 + R() * (f === F_OUT ? 22 : 14);
      const base = f === F_OUT ? th.out.v[Math.floor(R() * th.out.v.length)] : f === F_ROAD ? th.road : f === F_PAVE ? th.pave : f === F_CORN ? "#3f3424" : th.in.base;
      g.fillStyle = rgba(shade(base, (R() - 0.5) * 0.25), f === F_OUT ? 0.5 : f === F_IN ? 0.1 : 0.18);
      g.beginPath(); g.ellipse(px, py, rr, rr * (0.5 + R() * 0.5), R() * 3, 0, TAU); g.fill();
    }
  }
  // 3) per-kind details
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x, f = m.floor[i], x0 = x * T, y0 = y * T;
    const fl = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= m.W || yy >= m.H ? -1 : m.floor[yy * m.W + xx]; };
    const solidT = (dx, dy) => { const xx = x + dx, yy = y + dy; return xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || m.tile[yy * m.W + xx] === T_WALL; };
    if (f === F_OUT) {
      if (th.out.kind === "grass") {
        for (let k = 0; k < 14; k++) { const px = x0 + R() * T, py = y0 + R() * T; g.strokeStyle = rgba(R() < 0.5 ? "#6a7a40" : "#2c361e", 0.55); g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * 4, py - 3 - R() * 4); g.stroke(); }
      } else if (th.out.kind === "mud") {
        for (let k = 0; k < 8; k++) { const px = x0 + R() * T, py = y0 + R() * T; g.fillStyle = rgba(R() < 0.6 ? "#2b2a1c" : "#565a3a", 0.45); g.fillRect(px, py, 1.5 + R() * 2, 1.5 + R() * 2); }
        if (R() < 0.05) { // rain puddle
          const px = x0 + R() * T, py = y0 + R() * T, rr = 10 + R() * 18;
          g.fillStyle = "rgba(20,26,34,.75)"; g.beginPath(); g.ellipse(px, py, rr, rr * 0.55, R() * 3, 0, TAU); g.fill();
          g.strokeStyle = "rgba(140,160,190,.25)"; g.lineWidth = 1.2; g.stroke();
        }
      } else {
        for (let k = 0; k < 6; k++) { g.fillStyle = rgba("#000", 0.12); g.fillRect(x0 + R() * T, y0 + R() * T, 2, 2); }
      }
    } else if (f === F_CORN) {
      g.strokeStyle = "rgba(30,22,14,.5)"; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const yy = y0 + 6 + k * 13; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + T, yy + (R() - 0.5) * 2); g.stroke(); }
    } else if (f === F_PAVE) {
      g.strokeStyle = "rgba(0,0,0,.22)"; g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, y0 + 0.5, T, T);
      if (R() < 0.18) { g.strokeStyle = "rgba(0,0,0,.25)"; g.beginPath(); let px = x0 + R() * T, py = y0 + R() * T; g.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 16; py += (R() - 0.5) * 16; g.lineTo(px, py); } g.stroke(); }
      if (R() < 0.12) { g.fillStyle = "rgba(20,20,20,.25)"; g.beginPath(); g.arc(x0 + R() * T, y0 + R() * T, 1.5, 0, TAU); g.fill(); }
      // curb against the road
      if (fl(0, 1) === F_ROAD) { g.fillStyle = "rgba(220,220,210,.35)"; g.fillRect(x0, y0 + T - 4, T, 3); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x0, y0 + T - 1, T, 2); }
      if (fl(0, -1) === F_ROAD) { g.fillStyle = "rgba(220,220,210,.35)"; g.fillRect(x0, y0 + 1, T, 3); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x0, y0, T, 1); }
      if (fl(1, 0) === F_ROAD) { g.fillStyle = "rgba(220,220,210,.35)"; g.fillRect(x0 + T - 4, y0, 3, T); g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x0 + T - 1, y0, 2, T); }
      if (fl(-1, 0) === F_ROAD) { g.fillStyle = "rgba(220,220,210,.35)"; g.fillRect(x0 + 1, y0, 3, T); }
    } else if (f === F_ROAD) {
      for (let k = 0; k < 10; k++) { g.fillStyle = rgba(R() < 0.5 ? "#000000" : "#9a9a9a", 0.12); g.fillRect(x0 + R() * T, y0 + R() * T, 1.5, 1.5); }
      if (R() < 0.06) { g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(x0 + R() * T, y0 + R() * T, 8 + R() * 10, 4 + R() * 6, R() * 3, 0, TAU); g.fill(); }  // oil stain
    } else if (f === F_IN) {
      const k = areaKind(i);
      if (k === "wood") {
        for (let r = 0; r < 4; r++) {
          const yy = y0 + r * 10;
          g.fillStyle = rgba(shade(th.in.base, (hash2(x, y * 4 + r, 2) - 0.5) * 0.2), 0.6); g.fillRect(x0, yy, T, 10);
          g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x0, yy + 9, T, 1);
          const seam = ((x * 17 + r * 23) % 40); g.fillRect(x0 + seam, yy, 1, 9);
          g.strokeStyle = "rgba(0,0,0,.08)"; g.beginPath(); g.moveTo(x0, yy + 3 + R() * 4); g.lineTo(x0 + T, yy + 3 + R() * 4); g.stroke();
        }
      } else if (k === "checker") {
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { if ((x * 2 + a + y * 2 + b) % 2) { g.fillStyle = "#2a2622"; g.fillRect(x0 + a * 20, y0 + b * 20, 20, 20); } }
        g.strokeStyle = "rgba(0,0,0,.15)"; g.strokeRect(x0 + 0.5, y0 + 0.5, 20, 20); g.strokeRect(x0 + 20.5, y0 + 20.5, 20, 20);
      } else if (k === "tile") {
        g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1;
        g.strokeRect(x0 + 0.5, y0 + 0.5, 20, 20); g.strokeRect(x0 + 20.5, y0 + 0.5, 20, 20); g.strokeRect(x0 + 0.5, y0 + 20.5, 20, 20); g.strokeRect(x0 + 20.5, y0 + 20.5, 20, 20);
      } else if (k === "metalfloor") {
        g.fillStyle = "rgba(255,255,255,.05)";
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { g.save(); g.translate(x0 + 5 + a * 10, y0 + 5 + b * 10); g.rotate((a + b) % 2 ? 0.6 : -0.6); g.fillRect(-3, -1, 6, 2); g.restore(); }
        g.strokeStyle = "rgba(0,0,0,.3)"; g.strokeRect(x0 + 0.5, y0 + 0.5, T, T);
      } else if (k === "dirtfloor") {
        for (let q = 0; q < 10; q++) { g.fillStyle = rgba("#000", 0.12); g.fillRect(x0 + R() * T, y0 + R() * T, 2, 2); }
      } else {
        // concrete: speckle + expansion joints every 2 tiles
        for (let q = 0; q < 8; q++) { g.fillStyle = rgba(R() < 0.5 ? "#000" : "#fff", 0.06); g.fillRect(x0 + R() * T, y0 + R() * T, 2, 2); }
        if (x % 2 === 0) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x0, y0, 1, T); }
        if (y % 2 === 0) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x0, y0, T, 1); }
      }
      // room edges are darker (dust in the corners)
      const grd = 6;
      if (solidT(0, -1)) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x0, y0, T, grd); }
      if (solidT(-1, 0)) { g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(x0, y0, grd, T); }
    } else if (f === F_WATER) {
      g.fillStyle = "rgba(90,120,140,.3)"; g.fillRect(x0, y0, T, T);
    }
  }
  // 4) road markings: dashed centre lines + crossings
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x; if (m.floor[i] !== F_ROAD) continue;
    const road = (xx, yy) => xx >= 0 && yy >= 0 && xx < m.W && yy < m.H && m.floor[yy * m.W + xx] === F_ROAD;
    // vertical run length through this tile
    let up = 0, dn = 0; while (road(x, y - up - 1)) up++; while (road(x, y + dn + 1)) dn++;
    let lf = 0, rt = 0; while (road(x - lf - 1, y)) lf++; while (road(x + rt + 1, y)) rt++;
    const vRun = up + dn + 1, hRun = lf + rt + 1;
    if (vRun <= 6 && hRun > 6 && up === Math.floor(vRun / 2) - 1) { // horizontal street: centre line under this row
      if (x % 2 === 0) { g.fillStyle = "rgba(230,190,60,.75)"; g.fillRect(x * T + 4, (y + 1) * T - 2, T - 8, 3); }
    }
    if (hRun <= 6 && vRun > 6 && lf === Math.floor(hRun / 2) - 1) {
      if (y % 2 === 0) { g.fillStyle = "rgba(230,190,60,.75)"; g.fillRect((x + 1) * T - 2, y * T + 4, 3, T - 8); }
    }
    if (vRun > 6 && hRun > 6) { g.fillStyle = "rgba(0,0,0,.06)"; g.fillRect(x * T, y * T, T, T); }
    // zebra crossing where a street meets the intersection
    if (hRun > 6 && vRun <= 6 && (road(x - 1, y - vRun) || road(x + 1, y + vRun))) { /* noop */ }
  }
  // 4b) where zombies come from: manholes on streets, disturbed dirt elsewhere
  for (const sp of m.spawners) {
    const f = m.floor[sp.y * m.W + sp.x], x = sp.wx, y = sp.wy;
    if (f === F_ROAD || f === F_PAVE || (f === F_IN && m.indoorKind && m.indoorKind(sp.y * m.W + sp.x) === "concrete")) {
      g.fillStyle = "#1c1d1f"; g.beginPath(); g.arc(x, y, 13, 0, TAU); g.fill();
      g.strokeStyle = "#3a3b3e"; g.lineWidth = 2; g.stroke();
      g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1; for (let k = -9; k <= 9; k += 4) { g.beginPath(); g.moveTo(x - 9, y + k); g.lineTo(x + 9, y + k); g.stroke(); }
    } else {
      g.fillStyle = "rgba(40,30,20,.55)"; g.beginPath(); g.ellipse(x, y, 16, 11, (sp.x * 7) % 3, 0, TAU); g.fill();
      g.fillStyle = "rgba(70,55,38,.6)"; for (let k = 0; k < 8; k++) { g.beginPath(); g.arc(x + (R() - 0.5) * 26, y + (R() - 0.5) * 18, 1.5 + R() * 2.5, 0, TAU); g.fill(); }
    }
  }
  // 5) soft shadows from walls / solid props (drawn small and scaled up = blur)
  const S = 8;
  const sc = makeCanvas(W / S, H / S), sg = sc.getContext("2d");
  sg.fillStyle = "#000";
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const t = m.tile[y * m.W + x];
    const hgt = t === T_WALL || t === T_DOOR ? 1 : t === T_HIGH || t === T_TREE ? 0.7 : t === T_LOW || t === T_BARREL ? 0.35 : 0;
    if (!hgt) continue;
    sg.globalAlpha = 0.55 * hgt + 0.2;
    sg.fillRect((x * T + 8 * hgt) / S, (y * T + 12 * hgt) / S, (T + 4) / S, (T + 6) / S);
  }
  g.save(); g.globalAlpha = 0.45; g.imageSmoothingEnabled = true; g.drawImage(sc, 0, 0, W, H); g.restore();
  // 6) a little grit + vignette per area (fine noise via a tiled pattern)
  const nz = makeCanvas(128, 128), ng = nz.getContext("2d"), id = ng.createImageData(128, 128);
  for (let k = 0; k < id.data.length; k += 4) { const v = Math.random() * 255; id.data[k] = id.data[k + 1] = id.data[k + 2] = v; id.data[k + 3] = 22; }
  ng.putImageData(id, 0, 0);
  g.save(); g.globalCompositeOperation = "overlay"; g.fillStyle = g.createPattern(nz, "repeat"); g.fillRect(0, 0, W, H); g.restore();
  return c;
}

/* ---------------- decals painted onto the baked ground ---------------- */
function decalBlood(R, x, y, s, a) {
  const g = R.gctx; if (!g) return;
  g.save(); g.translate(x, y); g.rotate(a || 0);
  g.fillStyle = "rgba(90,6,6,.55)";
  g.beginPath(); g.ellipse(0, 0, s, s * 0.7, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(60,0,0,.5)";
  for (let k = 0; k < 6; k++) { const d = s * (0.6 + Math.random() * 1.4), aa = (Math.random() - 0.5) * 1.2; g.beginPath(); g.arc(Math.cos(aa) * d, Math.sin(aa) * d, 1 + Math.random() * s * 0.25, 0, TAU); g.fill(); }
  g.restore();
}
function decalScorch(R, x, y, r) {
  const g = R.gctx; if (!g) return;
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, "rgba(10,8,6,.75)"); grd.addColorStop(0.6, "rgba(20,16,12,.4)"); grd.addColorStop(1, "rgba(20,16,12,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function decalAsh(R, x, y, s) {
  const g = R.gctx; if (!g) return;
  g.fillStyle = "rgba(40,38,36,.35)";
  for (let k = 0; k < 7; k++) { g.beginPath(); g.arc(x + (Math.random() - 0.5) * s * 2, y + (Math.random() - 0.5) * s * 2, 2 + Math.random() * s * 0.5, 0, TAU); g.fill(); }
}
function decalHole(R, x, y) {
  const g = R.gctx; if (!g) return;
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
}

/* ---------------- sprite cache ---------------- */
const SPR = {};
function spr(key, w, h, draw) {
  if (SPR[key]) return SPR[key];
  const c = makeCanvas(w * SPR_RES, h * SPR_RES), g = c.getContext("2d");
  g.scale(SPR_RES, SPR_RES);
  draw(g, w, h);
  c.w = w; c.h = h;
  SPR[key] = c;
  return c;
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* wooden / military crate */
function crateSprite(kind, seed) {
  return spr("crate" + kind + (seed % 4), 40, 40 + WH * 0.6, (g) => {
    const R = rng(seed + 7), top = WH * 0.6;
    if (kind === "military") {
      g.fillStyle = "#2d3424"; g.fillRect(2, top + 2, 36, 36);
      g.fillStyle = "#4a5636"; g.fillRect(2, 2, 36, 36);
      g.strokeStyle = "#323b26"; g.lineWidth = 2; g.strokeRect(5, 5, 30, 30);
      g.fillStyle = "#38422b"; g.fillRect(5, 18, 30, 4);
      g.fillStyle = "rgba(220,220,180,.55)"; g.font = "bold 7px sans-serif"; g.fillText(["AMMO", "5.56", "MRE", "TNT"][seed % 4], 9, 15);
      g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(2, 2, 36, 3);
    } else if (kind === "wood") {
      g.fillStyle = "#4a3420"; g.fillRect(2, top + 2, 36, 36);
      g.fillStyle = "#8a6438"; g.fillRect(2, 2, 36, 36);
      g.strokeStyle = "#5e4224"; g.lineWidth = 1;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(2, 2 + k * 7.2 + 7); g.lineTo(38, 2 + k * 7.2 + 7); g.stroke(); }
      g.lineWidth = 3; g.strokeStyle = "#6b4c2a"; g.beginPath(); g.moveTo(4, 4); g.lineTo(36, 36); g.moveTo(36, 4); g.lineTo(4, 36); g.stroke();
      g.strokeStyle = "#3c2a17"; g.lineWidth = 2; g.strokeRect(3, 3, 34, 34);
    } else if (kind === "desk") {
      g.fillStyle = "#3a2e22"; g.fillRect(1, top + 4, 38, 34);
      g.fillStyle = "#6e5640"; rr(g, 1, 4, 38, 32, 3); g.fill();
      g.fillStyle = "#ddd8c8"; g.fillRect(6 + R() * 8, 9, 12, 9); g.fillStyle = "#2a2a2a"; g.fillRect(24, 12, 9, 6);
      g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(1, 4, 38, 3);
    } else if (kind === "booth") {
      g.fillStyle = "#5a1a1a"; rr(g, 0, 2, 40, 36, 6); g.fill();
      g.fillStyle = "#9a2a2a"; rr(g, 3, 5, 34, 30, 5); g.fill();
      g.fillStyle = "#d7d2c4"; rr(g, 9, 10, 22, 20, 3); g.fill();
      g.fillStyle = "#c33"; g.beginPath(); g.arc(20, 20, 3, 0, TAU); g.fill();
    } else if (kind === "shelf") {
      g.fillStyle = "#2a2a2c"; g.fillRect(2, top, 36, 38);
      g.fillStyle = "#56565a"; g.fillRect(2, 2, 36, 36);
      const cols = ["#c0392b", "#2980b9", "#f1c40f", "#27ae60", "#e67e22", "#ecf0f1"];
      for (let k = 0; k < 8; k++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.fillRect(5 + (k % 4) * 8, 6 + Math.floor(k / 4) * 16, 6, 12); }
    } else if (kind === "bunk") {
      g.fillStyle = "#3b3b36"; g.fillRect(2, top, 36, 38);
      g.fillStyle = "#5c5f52"; g.fillRect(2, 2, 36, 36);
      g.fillStyle = "#6f7560"; g.fillRect(5, 5, 30, 30);
      g.fillStyle = "#c8c4b0"; g.fillRect(7, 7, 12, 8);
      g.strokeStyle = "rgba(0,0,0,.25)"; g.strokeRect(5, 5, 30, 30);
    } else { // hay / generic
      g.fillStyle = "#6b5a2a"; g.fillRect(2, top + 2, 36, 36);
      g.fillStyle = "#c2a24e"; g.fillRect(2, 2, 36, 36);
      g.strokeStyle = "rgba(90,70,20,.5)"; for (let k = 0; k < 18; k++) { const x = 3 + R() * 34, y = 3 + R() * 34; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 8, y + (R() - 0.5) * 3); g.stroke(); }
    }
  });
}

/* vehicles (w × h in tiles). style: car / truck / military / cruiser / tractor */
function vehicleSprite(v, theme, mapId) {
  const tw = v.x1 - v.x0 + 1, th = v.y1 - v.y0 + 1;
  const horiz = tw >= th;
  const L = (horiz ? tw : th) * TILE, Wd = (horiz ? th : tw) * TILE;
  const R = rng(v.seed);
  const pal = mapId === "outpost" ? ["#4b5434", "#5a5f3c", "#3f4630"] : mapId === "farm" ? ["#9a2c22", "#3b5f8a", "#6b6b5a", "#b08a3a"] : ["#8a1f1f", "#2b4b7a", "#c8c2b0", "#2f2f33", "#6b7a3a", "#a86a2a"];
  const col = pal[Math.floor(R() * pal.length)];
  const kind = mapId === "outpost" ? "military" : mapId === "farm" && L >= 120 && Wd >= 80 ? (R() < 0.5 ? "tractor" : "pickup") : L >= 120 && Wd >= 80 ? "truck" : "car";
  const key = "veh" + v.seed + kind + col;
  const c = spr(key, L, Wd, (g) => {
    const m = 4, bl = L - m * 2, bw = Wd - m * 2 - 6;
    g.translate(m, m + 3);
    // tyres
    g.fillStyle = "#111";
    for (const tx of [bl * 0.16, bl * 0.78]) { g.fillRect(tx, -3, bl * 0.12, 4); g.fillRect(tx, bw - 1, bl * 0.12, 4); }
    const body = (x, y, w, h, r, c1) => { const grd = g.createLinearGradient(0, y, 0, y + h); grd.addColorStop(0, shade(c1, 0.18)); grd.addColorStop(0.5, c1); grd.addColorStop(1, shade(c1, -0.3)); g.fillStyle = grd; rr(g, x, y, w, h, r); g.fill(); };
    if (kind === "military") {
      body(0, 0, bl, bw, 4, col);
      g.fillStyle = shade(col, -0.25); g.fillRect(bl * 0.62, 2, 2, bw - 4);
      // canvas-covered bed
      g.fillStyle = shade(col, 0.1); rr(g, 2, 2, bl * 0.58, bw - 4, 3); g.fill();
      g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1.5; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(2 + (bl * 0.58 / 5) * k, 3); g.lineTo(2 + (bl * 0.58 / 5) * k, bw - 3); g.stroke(); }
      // cab
      g.fillStyle = "#1c2026"; rr(g, bl * 0.66, 4, bl * 0.12, bw - 8, 2); g.fill();
      g.fillStyle = "rgba(160,190,210,.35)"; g.fillRect(bl * 0.68, 6, bl * 0.04, bw - 12);
      g.fillStyle = "#e8e2c0"; g.fillRect(bl - 3, 3, 3, 5); g.fillRect(bl - 3, bw - 8, 3, 5);
      g.fillStyle = "rgba(255,255,255,.75)"; g.font = "bold 9px sans-serif"; g.fillText("★", bl * 0.82, bw / 2 + 3);
    } else if (kind === "tractor") {
      body(bl * 0.35, bw * 0.15, bl * 0.65, bw * 0.7, 6, "#2e6b2e");
      g.fillStyle = "#151515"; g.fillRect(0, -4, bl * 0.34, 7); g.fillRect(0, bw - 3, bl * 0.34, 7);
      g.fillStyle = "#1f1f1f"; rr(g, bl * 0.1, bw * 0.2, bl * 0.3, bw * 0.6, 3); g.fill();
      g.fillStyle = "#c9b04a"; g.fillRect(bl * 0.86, bw * 0.3, bl * 0.1, bw * 0.4);
    } else {
      body(0, 0, bl, bw, kind === "car" ? 10 : 5, col);
      // windscreen + roof
      const roofX = kind === "car" ? bl * 0.3 : kind === "pickup" ? bl * 0.55 : bl * 0.6, roofW = kind === "car" ? bl * 0.42 : bl * 0.25;
      g.fillStyle = "rgba(25,30,38,.9)"; rr(g, roofX - 6, 4, roofW + 12, bw - 8, 6); g.fill();
      g.fillStyle = "rgba(150,180,200,.35)"; rr(g, roofX + roofW + 1, 6, 5, bw - 12, 2); g.fill(); rr(g, roofX - 5, 6, 4, bw - 12, 2); g.fill();
      body(roofX, 6, roofW, bw - 12, 4, shade(col, 0.05));
      if (kind !== "car") { g.fillStyle = shade(col, -0.35); g.fillRect(4, 4, roofX - 14, bw - 8); g.strokeStyle = "rgba(0,0,0,.3)"; g.strokeRect(4, 4, roofX - 14, bw - 8); }
      g.fillStyle = "#f4ecc8"; g.fillRect(bl - 3, 3, 3, 6); g.fillRect(bl - 3, bw - 9, 3, 6);
      g.fillStyle = "#a01010"; g.fillRect(0, 3, 2, 6); g.fillRect(0, bw - 9, 2, 6);
      // rust / dents
      for (let k = 0; k < 6; k++) { g.fillStyle = rgba(R() < 0.5 ? "#5a3a20" : "#000", 0.25); g.beginPath(); g.arc(R() * bl, R() * bw, 2 + R() * 5, 0, TAU); g.fill(); }
      if (mapId === "downtown" && R() < 0.3) { g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(roofX + roofW * 0.35, bw * 0.4, roofW * 0.3, bw * 0.2); }
    }
    g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, 0, bl, 3);
  });
  return { c, horiz, L, Wd };
}

function treeCanopy(seed, kind) {
  return spr("tree" + kind + (seed % 5), 96, 96, (g) => {
    const R = rng(seed * 3 + 1);
    const base = kind === "pine" ? "#1f3a24" : kind === "dead" ? "#3a3428" : "#2c4a24";
    for (let k = 0; k < 14; k++) {
      const a = R() * TAU, d = R() * 26, r = 14 + R() * 14;
      const x = 48 + Math.cos(a) * d, y = 48 + Math.sin(a) * d;
      const grd = g.createRadialGradient(x - 4, y - 4, 2, x, y, r);
      grd.addColorStop(0, shade(base, 0.25)); grd.addColorStop(1, rgba(shade(base, -0.3), 0.0));
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.fillStyle = rgba(shade(base, -0.2), 0.85); g.beginPath(); g.arc(48, 48, 30, 0, TAU); g.fill();
    for (let k = 0; k < 40; k++) { g.fillStyle = rgba(shade(base, R() * 0.4), 0.6); g.beginPath(); g.arc(48 + (R() - 0.5) * 60, 48 + (R() - 0.5) * 60, 3 + R() * 4, 0, TAU); g.fill(); }
  });
}

function barrelSprite(dead) {
  return spr("barrel" + dead, 32, 32, (g) => {
    if (dead) { g.fillStyle = "#1a1512"; g.beginPath(); g.arc(16, 16, 12, 0, TAU); g.fill(); g.strokeStyle = "#3a2a20"; g.lineWidth = 2; g.stroke(); return; }
    const grd = g.createRadialGradient(12, 12, 2, 16, 16, 14); grd.addColorStop(0, "#ff5a3a"); grd.addColorStop(1, "#8a1a10");
    g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 13, 0, TAU); g.fill();
    g.strokeStyle = "#5a0e08"; g.lineWidth = 2; g.beginPath(); g.arc(16, 16, 9, 0, TAU); g.stroke();
    g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(16, 9); g.lineTo(22, 20); g.lineTo(10, 20); g.closePath(); g.fill();
    g.fillStyle = "#111"; g.font = "bold 8px sans-serif"; g.textAlign = "center"; g.fillText("!", 16, 19);
  });
}

/* perk machine (top view: a tall vending machine against a wall) */
function perkSprite(id, lit) {
  const P = PERKS[id];
  return spr("perk" + id + lit, 40, 40, (g) => {
    g.fillStyle = "#151515"; rr(g, 2, 2, 36, 36, 4); g.fill();
    const grd = g.createLinearGradient(0, 4, 0, 36); grd.addColorStop(0, shade(P.col, lit ? 0.25 : -0.35)); grd.addColorStop(1, shade(P.col, lit ? -0.2 : -0.6));
    g.fillStyle = grd; rr(g, 4, 4, 32, 32, 3); g.fill();
    g.fillStyle = lit ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.25)";
    g.beginPath(); g.arc(20, 18, 8, 0, TAU); g.fill();
    g.fillStyle = shade(P.col, -0.4); g.font = "bold 11px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(perkGlyph(id), 20, 18.5);
    g.fillStyle = lit ? "#fff" : "rgba(255,255,255,.4)"; g.font = "bold 5px sans-serif"; g.fillText(P.name, 20, 31);
  });
}
function perkGlyph(id) { return { iron: "♥", quick: "⟳", rapid: "»", wind: "✚", swift: "➤" }[id] || "?"; }

function boxSprite(open) {
  return spr("box" + open, 72, 40, (g) => {
    g.fillStyle = "#2a1a0e"; rr(g, 2, 4, 68, 32, 3); g.fill();
    const grd = g.createLinearGradient(0, 4, 0, 34); grd.addColorStop(0, "#7a5230"); grd.addColorStop(1, "#4a2f1a");
    g.fillStyle = grd; rr(g, 4, 6, 64, 28, 2); g.fill();
    g.strokeStyle = "#c9a34a"; g.lineWidth = 2; g.strokeRect(6, 8, 60, 24);
    g.fillStyle = "#c9a34a"; g.fillRect(34, 6, 4, 28);
    if (open) { g.fillStyle = "#0a0805"; g.fillRect(8, 10, 56, 20); g.fillStyle = "rgba(255,230,140,.6)"; g.fillRect(10, 12, 52, 16); }
    else { g.fillStyle = "rgba(255,220,120,.9)"; g.font = "bold 14px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 20, 20); g.fillText("?", 52, 20); }
  });
}

function forgeSprite(lit) {
  return spr("forge" + lit, 40, 40, (g) => {
    g.fillStyle = "#1b1b1d"; rr(g, 1, 1, 38, 38, 5); g.fill();
    g.fillStyle = "#3a3a40"; rr(g, 4, 4, 32, 32, 4); g.fill();
    const grd = g.createRadialGradient(20, 20, 2, 20, 20, 14); grd.addColorStop(0, lit ? "#fff2b0" : "#3a2a20"); grd.addColorStop(0.5, lit ? "#ff7a1a" : "#2a1a12"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(20, 20, 13, 0, TAU); g.fill();
    g.fillStyle = "#555"; g.fillRect(8, 30, 24, 4);
    g.strokeStyle = lit ? "#ffb24a" : "#555"; g.lineWidth = 1.5; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(20, 20, 8 + k * 2.5, k, k + 1.2); g.stroke(); }
  });
}
function switchSprite(on) {
  return spr("pwr" + on, 40, 40, (g) => {
    g.fillStyle = "#2a2d30"; rr(g, 4, 4, 32, 32, 3); g.fill();
    g.fillStyle = "#ffd23f"; for (let k = 0; k < 4; k++) { g.save(); g.translate(4 + k * 9, 4); g.rotate(0.5); g.fillRect(0, 0, 4, 10); g.restore(); }
    g.fillStyle = "#111"; g.fillRect(14, 12, 12, 20);
    g.fillStyle = "#bbb"; g.fillRect(18, on ? 13 : 23, 4, 8);
    g.fillStyle = on ? "#3aff6a" : "#ff3a3a"; g.beginPath(); g.arc(30, 30, 3, 0, TAU); g.fill();
  });
}
function lampHead() {
  return spr("lamp", 24, 24, (g) => {
    g.fillStyle = "#222"; g.beginPath(); g.arc(12, 12, 7, 0, TAU); g.fill();
    g.fillStyle = "#fff6d0"; g.beginPath(); g.arc(12, 12, 4, 0, TAU); g.fill();
  });
}
function graveSprite(seed) {
  return spr("grave" + (seed % 3), 40, 40, (g) => {
    g.fillStyle = "#3a3a38"; rr(g, 9, 13, 22, 20, 8); g.fill();
    g.fillStyle = "#8a8a84"; rr(g, 9, 8, 22, 20, 8); g.fill();
    g.fillStyle = "#6a6a64"; g.fillRect(12, 12, 16, 2); g.fillRect(14, 16, 12, 1.5);
    g.fillStyle = "rgba(60,80,40,.5)"; g.fillRect(9, 24, 22, 4);
  });
}

/* ---------------- guns (drawn pointing right, origin at the grip) ---------------- */
function drawGun(g, cls, up) {
  const metal = "#1d1f22", dark = "#121315", wood = "#5a3a22", glow = up || null;
  g.fillStyle = metal;
  switch (cls) {
    case "pistol": g.fillRect(0, -2, 13, 4); g.fillStyle = dark; g.fillRect(-2, -1.5, 4, 3); break;
    case "magnum": g.fillRect(0, -2.2, 17, 4.4); g.fillStyle = "#3a3a3a"; g.beginPath(); g.arc(4, 0, 3.4, 0, TAU); g.fill(); break;
    case "smg": g.fillRect(-6, -2.6, 22, 5.2); g.fillStyle = dark; g.fillRect(4, 2, 4, 7); g.fillRect(-10, -1.5, 5, 3); break;
    case "rifle": g.fillRect(-10, -2.4, 34, 4.8); g.fillStyle = dark; g.fillRect(4, 2, 5, 7); g.fillRect(-14, -2, 6, 4); g.fillStyle = "#2a2d30"; g.fillRect(6, -4, 8, 2); break;
    case "ak": g.fillStyle = wood; g.fillRect(-14, -2.2, 8, 4.4); g.fillStyle = metal; g.fillRect(-6, -2.4, 30, 4.8); g.fillStyle = wood; g.fillRect(12, -2.6, 8, 5.2); g.fillStyle = dark; g.save(); g.translate(4, 2); g.rotate(0.35); g.fillRect(0, 0, 4.5, 8); g.restore(); break;
    case "shotgun": g.fillStyle = wood; g.fillRect(-14, -2.4, 10, 4.8); g.fillStyle = metal; g.fillRect(-4, -2.2, 30, 4.4); g.fillStyle = wood; g.fillRect(10, -2.8, 9, 5.6); break;
    case "dmr": g.fillRect(-12, -2.4, 38, 4.8); g.fillStyle = "#333"; g.fillRect(2, -4.5, 10, 2.5); g.fillStyle = dark; g.fillRect(6, 2, 4, 6); break;
    case "lmg": g.fillRect(-12, -3.2, 38, 6.4); g.fillStyle = "#2b3a22"; g.fillRect(2, 2.5, 9, 8); g.fillStyle = dark; g.fillRect(24, -1.5, 8, 3); break;
    case "sniper": g.fillRect(-14, -2.2, 46, 4.4); g.fillStyle = "#111"; g.fillRect(0, -5, 14, 3); g.fillStyle = "#4a5a3a"; g.fillRect(-14, -2.6, 12, 5.2); break;
    case "launcher": g.fillStyle = "#2f3a2a"; g.fillRect(-8, -4.5, 30, 9); g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(6, 0, 6, 0, TAU); g.fill(); break;
    case "volt": g.fillStyle = "#2a3440"; g.fillRect(-6, -3.5, 26, 7); g.fillStyle = "#7ad7ff"; for (let k = 0; k < 4; k++) g.fillRect(-2 + k * 5, -4.5, 2, 9); break;
  }
  if (glow) { g.strokeStyle = glow; g.globalAlpha = 0.7; g.lineWidth = 1; g.strokeRect(-6, -3, 26, 6); g.globalAlpha = 1; }
}
function gunLen(cls) { return { pistol: 13, magnum: 17, smg: 16, rifle: 24, ak: 24, shotgun: 26, dmr: 26, lmg: 26, sniper: 32, launcher: 22, volt: 20 }[cls] || 20; }

/* ---------------- soldiers ---------------- */
function drawSoldier(g, a, t, o = {}) {
  const op = OPERATORS.find((p) => p.id === a.op) || OPERATORS[0];
  const d = curDef(a);
  const r = a.r;
  const moving = Math.hypot(a.vx, a.vy) > 25;
  g.save();
  g.translate(a.x, a.y);
  g.scale(CHAR_SCALE, CHAR_SCALE);
  // team ring on the ground (Team Deathmatch) / player ring (co-op)
  if (o.ring) { g.strokeStyle = rgba(o.ring, 0.7); g.lineWidth = 2; g.beginPath(); g.ellipse(0, 3, r + 6, r + 4, 0, 0, TAU); g.stroke(); }
  // shadow
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(4, 6, r * 1.15, r * 0.9, 0, 0, TAU); g.fill();
  if (a.down) { g.rotate(a.ang); drawDowned(g, a, op, d, t); g.restore(); return; }
  // legs (follow the walking direction)
  if (moving) {
    g.save(); g.rotate(a.moveAng);
    const s = Math.sin(a.walk * 2.2) * 7;
    g.fillStyle = shade(op.cloth, -0.35);
    g.beginPath(); g.ellipse(s, -5, 6, 3.5, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-s, 5, 6, 3.5, 0, 0, TAU); g.fill();
    g.fillStyle = "#151515"; g.beginPath(); g.ellipse(s + 4, -5, 3, 3, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-s + 4, 5, 3, 3, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.rotate(a.ang);
  const kick = a.recoil * 2.5;
  const knife = a.knifeT > 0;
  const twoHand = !["pistol", "magnum"].includes(d.cls);
  // arms + gun
  g.save(); g.translate(-kick, 0);
  const gx = twoHand ? 6 : 10;
  if (!knife) {
    // back arm (support hand on the foregrip)
    g.fillStyle = op.cloth; g.strokeStyle = shade(op.cloth, -0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(-2, -r * 0.62); g.quadraticCurveTo(6, -r * 0.6, twoHand ? gx + 10 : gx + 2, -1.2); g.lineTo(twoHand ? gx + 10 : gx + 2, 2.2); g.quadraticCurveTo(4, -r * 0.2, -2, -r * 0.25); g.closePath(); g.fill(); g.stroke();
    g.save(); g.translate(gx, 0.5); drawGun(g, d.cls, d.upgraded ? d.col : null); g.restore();
    // front arm (trigger hand)
    g.fillStyle = op.cloth;
    g.beginPath(); g.moveTo(-2, r * 0.66); g.quadraticCurveTo(4, r * 0.7, gx + 1, 2.4); g.lineTo(gx + 1, -1); g.quadraticCurveTo(2, r * 0.25, -2, r * 0.25); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = op.skin === "#2a2a2c" ? "#1a1a1a" : "#2a2a24"; // gloves
    g.beginPath(); g.arc(gx + 1, 1, 2.6, 0, TAU); g.fill();
    if (twoHand) { g.beginPath(); g.arc(gx + 10, 0.5, 2.6, 0, TAU); g.fill(); }
  } else {
    // knife slash: arm sweeps across
    const p = 1 - a.knifeT / 0.35, sw = -1 + p * 2;
    g.fillStyle = op.cloth; g.save(); g.rotate(sw * 0.9);
    g.fillRect(0, r * 0.2, 16, 5); g.fillStyle = "#cfd5da"; g.fillRect(16, r * 0.2 + 1, 10, 2.4); g.fillStyle = "#222"; g.fillRect(13, r * 0.2, 4, 4.5); g.restore();
  }
  g.restore();
  // torso (shoulders) + vest
  const grd = g.createLinearGradient(0, -r, 0, r);
  grd.addColorStop(0, shade(op.cloth, 0.12)); grd.addColorStop(1, shade(op.cloth, -0.25));
  g.fillStyle = grd; g.strokeStyle = "rgba(0,0,0,.65)"; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(-2, 0, r * 0.64, r * 1.0, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = shade(op.cloth, -0.12); g.beginPath(); g.ellipse(-1, -r * 0.78, r * 0.36, r * 0.24, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-1, r * 0.78, r * 0.36, r * 0.24, 0, 0, TAU); g.fill();
  g.fillStyle = op.vest; rr(g, -r * 0.55, -r * 0.6, r * 0.95, r * 1.2, 3); g.fill(); g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 0.8; g.stroke();
  g.fillStyle = shade(op.vest, -0.25); g.fillRect(-r * 0.15, -r * 0.55, 3.5, 3.5); g.fillRect(-r * 0.15, r * 0.25, 3.5, 3.5); g.fillRect(-r * 0.45, -2, 3, 4);
  // team / player stripe on the shoulders
  if (o.band) { g.fillStyle = o.band; g.fillRect(-4, -r * 0.98, 6, 3); g.fillRect(-4, r * 0.98 - 3, 6, 3); }
  // backpack / radio
  g.fillStyle = shade(op.vest, -0.15); rr(g, -r * 0.95, -r * 0.42, r * 0.42, r * 0.84, 2); g.fill();
  if (op.head === "cap") { g.strokeStyle = "#111"; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-r * 0.8, -r * 0.4); g.lineTo(-r * 1.3, -r * 0.9); g.stroke(); }
  // head
  drawHead(g, op, r, t);
  g.restore();
}

function drawHead(g, op, r, t) {
  const hr = r * 0.52;
  g.fillStyle = "rgba(0,0,0,.55)"; g.beginPath(); g.arc(0.5, 0, hr * 1.22, 0, TAU); g.fill();
  switch (op.head) {
    case "helmet": {
      const gr = g.createRadialGradient(-1, -1, 1, 1, 0, hr * 1.25);
      gr.addColorStop(0, shade(op.cloth, 0.25)); gr.addColorStop(1, shade(op.cloth, -0.25));
      g.fillStyle = gr; g.beginPath(); g.ellipse(1, 0, hr * 1.18, hr * 1.12, 0, 0, TAU); g.fill();
      g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 0.8; g.beginPath(); g.arc(1, 0, hr * 0.8, -1, 1); g.stroke();
      g.fillStyle = "#111"; g.fillRect(hr * 0.6, -1.5, 2.5, 3);  // NVG mount
      break;
    }
    case "boonie": {
      g.fillStyle = shade(op.cloth, -0.1); g.beginPath(); g.arc(0.5, 0, hr * 1.55, 0, TAU); g.fill();
      g.fillStyle = shade(op.cloth, 0.08); g.beginPath(); g.arc(0.5, 0, hr * 0.95, 0, TAU); g.fill();
      g.strokeStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(0.5, 0, hr * 1.2, 0, TAU); g.stroke();
      break;
    }
    case "cap": {
      g.fillStyle = op.skin; g.beginPath(); g.arc(0, 0, hr, 0, TAU); g.fill();
      g.fillStyle = "#2a3a4c"; g.beginPath(); g.arc(-0.5, 0, hr * 0.95, Math.PI * 0.5, Math.PI * 1.5); g.fill();
      g.fillStyle = "#1f2c3a"; g.beginPath(); g.ellipse(-hr * 0.95, 0, hr * 0.5, hr * 0.7, 0, 0, TAU); g.fill();
      g.fillStyle = "#111"; g.fillRect(-1.5, -hr - 1.5, 3, hr * 2 + 3);
      g.fillStyle = "#333"; g.beginPath(); g.arc(0, -hr - 1, 2.2, 0, TAU); g.fill(); g.beginPath(); g.arc(0, hr + 1, 2.2, 0, TAU); g.fill();
      break;
    }
    case "balaclava": {
      g.fillStyle = "#151517"; g.beginPath(); g.arc(0, 0, hr * 1.05, 0, TAU); g.fill();
      g.fillStyle = "rgba(120,255,140,.65)"; g.fillRect(hr * 0.55, -hr * 0.55, 2, 2); g.fillRect(hr * 0.55, hr * 0.25, 2, 2);
      break;
    }
    case "ponytail": {
      g.fillStyle = op.hair; g.beginPath(); g.ellipse(-hr * 1.25, 0, hr * 0.9, hr * 0.38, 0, 0, TAU); g.fill();
      g.fillStyle = op.hair; g.beginPath(); g.arc(0, 0, hr * 1.02, 0, TAU); g.fill();
      g.fillStyle = "#4c5560"; g.beginPath(); g.arc(0.5, 0, hr * 0.92, -1.6, 1.6); g.fill();
      g.fillStyle = "#3a424c"; g.beginPath(); g.ellipse(hr * 0.9, 0, hr * 0.35, hr * 0.85, 0, -1.6, 1.6); g.fill();
      break;
    }
    case "skull": {
      g.fillStyle = "#1c1b1a"; g.beginPath(); g.arc(-1, 0, hr * 1.25, 0, TAU); g.fill();
      g.fillStyle = "#d8d2c4"; g.beginPath(); g.ellipse(hr * 0.35, 0, hr * 0.7, hr * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = "#111"; g.beginPath(); g.arc(hr * 0.55, -hr * 0.35, 1.8, 0, TAU); g.fill(); g.beginPath(); g.arc(hr * 0.55, hr * 0.35, 1.8, 0, TAU); g.fill();
      break;
    }
  }
}

function drawDowned(g, a, op, d, t) {
  // lying on the floor, pistol up
  const r = a.r;
  g.fillStyle = shade(op.cloth, -0.2); g.beginPath(); g.ellipse(-10, 2, r * 1.3, r * 0.6, 0.15, 0, TAU); g.fill();
  g.fillStyle = op.vest; rr(g, -r * 0.9, -r * 0.5, r * 1.2, r * 1.0, 3); g.fill();
  g.save(); g.translate(8, 2); drawGun(g, d.cls, null); g.restore();
  drawHead(g, op, r, t);
  if (GRITTY()) { g.fillStyle = "rgba(120,0,0,.4)"; g.beginPath(); g.ellipse(-6, 6, 12, 7, 0, 0, TAU); g.fill(); }
}

/* ---------------- zombies ---------------- */
// zombie clothes per map: soldiers at the Outpost, townspeople Downtown, farmhands at the Farmhouse
const ZCLOTH = {
  outpost: ["#3d4530", "#4a4f36", "#353a2a", "#5a5a44", "#2e3428", "#4b4a3a", "#3a3a3a", "#56503c"],
  downtown: ["#2b2f3a", "#4a2a2a", "#3a3a40", "#5a4a32", "#24343e", "#5e2e3e", "#2f2f2f", "#4a3e5a", "#6a5a46"],
  farm: ["#3a4a6a", "#6a3a2a", "#4a5a3a", "#5a4630", "#2e3e5a", "#7a5a3a", "#5a2a24", "#3e3a30"],
};
let ZSHIRT = ZCLOTH.outpost;
const ZSKIN = ["#6f7c5e", "#7a8468", "#5f6e58", "#878a70", "#6a645a", "#748068", "#5a6650"];
const ZHAIR = ["#141210", "#2a1e14", "#4a3e30", "#6a6a62", null, "#1e140c", null];
function drawZombie(g, z, t, o = {}) {
  const look = z.look || 0, r = (ZTYPES[z.ztype] && ZTYPES[z.ztype].draw) || z.r;
  const shirt = ZSHIRT[look % ZSHIRT.length], skin = ZSKIN[(look >> 3) % ZSKIN.length], hair = ZHAIR[(look >> 5) % ZHAIR.length];
  g.save(); g.translate(z.x, z.y); g.scale(CHAR_SCALE, CHAR_SCALE);
  // rising out of the ground
  let rise = 0;
  if (z.rise > 0 && z.ztype !== "hound") {
    rise = clamp(z.rise / 1.1, 0, 1);
    g.fillStyle = "rgba(40,30,20,.7)"; g.beginPath(); g.ellipse(0, 0, r * 1.6, r * 1.2, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(70,55,35,.8)"; for (let k = 0; k < 6; k++) { const a = k + look; g.beginPath(); g.arc(Math.cos(a) * r * 1.3, Math.sin(a) * r, 3, 0, TAU); g.fill(); }
    g.globalAlpha = 1 - rise * 0.6; const s = 1 - rise * 0.5; g.scale(s, s);
  }
  if (z.ztype === "hound") { drawHound(g, z, t); g.restore(); return; }
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(4, 6, r * 1.1, r * 0.85, 0, 0, TAU); g.fill();
  const moving = Math.hypot(z.vx, z.vy) > 15;
  g.rotate(z.ang);
  const ph = z.walk;
  const run = z.speed > 90;
  if (z.ztype === "exploder") {
    const pulse = 1 + Math.sin(t * 6 + look) * 0.04 + (z.fuse > 0 ? Math.sin(t * 40) * 0.08 : 0);
    g.scale(pulse, pulse);
    g.fillStyle = "#4a5a2a"; g.beginPath(); g.ellipse(0, 0, r * 1.05, r * 1.1, 0, 0, TAU); g.fill();
    const gr = g.createRadialGradient(-3, -3, 2, 0, 0, r * 1.1); gr.addColorStop(0, "#a8c050"); gr.addColorStop(1, "rgba(80,100,30,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r * 1.0, r * 1.05, 0, 0, TAU); g.fill();
    g.fillStyle = "#c8d860"; for (let k = 0; k < 5; k++) { const a = k * 1.3 + look; g.beginPath(); g.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 2.2, 0, TAU); g.fill(); }
    g.fillStyle = skin; g.beginPath(); g.arc(r * 0.55, 0, r * 0.42, 0, TAU); g.fill();
    g.restore(); return;
  }
  const big = z.ztype === "brute";
  // legs
  if (moving) {
    const s = Math.sin(ph) * (run ? 8 : 5) * (big ? 1.4 : 1);
    g.fillStyle = shade(shirt, -0.4);
    g.beginPath(); g.ellipse(s, -r * 0.4, r * 0.45, r * 0.26, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(-s, r * 0.4, r * 0.45, r * 0.26, 0, 0, TAU); g.fill();
  }
  // arms reaching forward (walkers) or swinging (runners) / attacking
  const atk = z.atkT > 0 ? 1 - z.atkT / ZTYPES[z.ztype].windup : 0;
  const reach = run ? 0.4 + Math.sin(ph) * 0.4 : 1;
  g.fillStyle = big ? skin : shade(skin, -0.05);
  g.strokeStyle = shade(skin, -0.4); g.lineWidth = 1;
  const armL = r * (0.9 + reach * 0.7 + atk * 0.5);
  for (const side of [-1, 1]) {
    const sw = run ? Math.sin(ph + (side > 0 ? Math.PI : 0)) * 4 : Math.sin(t * 2 + look + side) * 1.5;
    g.save(); g.translate(0, side * r * 0.62); g.rotate(-side * (0.08 + atk * 0.25));
    rr(g, 0, -r * 0.18, armL + sw, r * 0.36, r * 0.18); g.fill(); g.stroke();
    g.fillStyle = shade(skin, -0.2); g.beginPath(); g.arc(armL + sw, 0, r * 0.22, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = big ? skin : shade(skin, -0.05);
  }
  // torso
  const tg = g.createLinearGradient(0, -r, 0, r); tg.addColorStop(0, shade(big ? skin : shirt, 0.08)); tg.addColorStop(1, shade(big ? skin : shirt, -0.35));
  g.fillStyle = tg; g.strokeStyle = "rgba(0,0,0,.7)"; g.lineWidth = 1.2; g.beginPath(); g.ellipse(-1, 0, r * 0.64, r * 1.0, 0, 0, TAU); g.fill(); g.stroke();
  // torn shirt edge
  g.fillStyle = shade(shirt, -0.45); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-r * 0.6, -r * 0.5 + k * r * 0.4); g.lineTo(-r * 0.35, -r * 0.35 + k * r * 0.4); g.lineTo(-r * 0.62, -r * 0.2 + k * r * 0.4); g.fill(); }
  if (big) { g.strokeStyle = "#4a4a4a"; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.9); g.lineTo(r * 0.3, r * 0.9); g.stroke(); }
  if (z.ztype === "soldier") { g.fillStyle = "#3a4130"; rr(g, -r * 0.5, -r * 0.6, r * 0.9, r * 1.2, 3); g.fill(); }
  // torn clothes, stains
  g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(-r * 0.2, r * 0.35, r * 0.22, 0, TAU); g.fill();
  if (GRITTY()) { g.fillStyle = "rgba(110,10,10,.6)"; g.beginPath(); g.arc(r * 0.1, -r * 0.3, r * 0.25, 0, TAU); g.fill(); g.beginPath(); g.arc(-r * 0.3, r * 0.1, r * 0.15, 0, TAU); g.fill(); }
  // head
  const hr = r * (big ? 0.42 : 0.48);
  const hx = run ? r * 0.25 : r * 0.12;
  g.fillStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.arc(hx, 0, hr * 1.15, 0, TAU); g.fill();
  g.fillStyle = skin; g.beginPath(); g.arc(hx, 0, hr, 0, TAU); g.fill();
  if (z.ztype === "soldier") { g.fillStyle = "#3d4530"; g.beginPath(); g.arc(hx - 1, 0, hr * 1.08, Math.PI * 0.45, Math.PI * 1.55); g.fill(); }
  else if (hair) { g.fillStyle = hair; g.beginPath(); g.arc(hx - 1.5, 0, hr * 0.92, Math.PI * 0.55, Math.PI * 1.45); g.fill(); }
  g.fillStyle = "rgba(20,10,10,.55)"; g.beginPath(); g.arc(hx + hr * 0.45, -hr * 0.38, hr * 0.24, 0, TAU); g.fill(); g.beginPath(); g.arc(hx + hr * 0.45, hr * 0.38, hr * 0.24, 0, TAU); g.fill();
  if (z.flash > 0) { g.globalCompositeOperation = "lighter"; g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(0, 0, r, r, 0, 0, TAU); g.fill(); }
  g.restore();
  // eye positions (for the glow pass)
  const S = CHAR_SCALE, ex = z.x + Math.cos(z.ang) * (hx + hr * 0.45) * S, ey = z.y + Math.sin(z.ang) * (hx + hr * 0.45) * S;
  z.eyes = [ex + Math.cos(z.ang - Math.PI / 2) * hr * 0.38 * S, ey + Math.sin(z.ang - Math.PI / 2) * hr * 0.38 * S, ex + Math.cos(z.ang + Math.PI / 2) * hr * 0.38 * S, ey + Math.sin(z.ang + Math.PI / 2) * hr * 0.38 * S];
}

function drawHound(g, z, t) {
  const r = z.r;
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(3, 5, r * 1.6, r * 0.8, z.ang, 0, TAU); g.fill();
  g.rotate(z.ang);
  const ph = z.walk * 1.6, s = Math.sin(ph) * 6;
  g.fillStyle = "#1a0e0c";
  for (const [x, y, k] of [[r * 0.9, -r * 0.55, 1], [r * 0.9, r * 0.55, -1], [-r * 0.9, -r * 0.55, -1], [-r * 0.9, r * 0.55, 1]]) { g.beginPath(); g.ellipse(x + s * k, y, 4, 2.5, 0, 0, TAU); g.fill(); }
  const gr = g.createLinearGradient(-r * 1.4, 0, r * 1.4, 0); gr.addColorStop(0, "#2a1210"); gr.addColorStop(1, "#4a1a14");
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, r * 1.45, r * 0.62, 0, 0, TAU); g.fill();
  g.fillStyle = "#5a1e16"; g.beginPath(); g.moveTo(-r * 1.4, 0); g.lineTo(-r * 2.2, Math.sin(t * 9) * 3); g.lineTo(-r * 1.3, 2); g.fill();
  g.fillStyle = "#3a1410"; g.beginPath(); g.ellipse(r * 1.45, 0, r * 0.62, r * 0.48, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(r * 1.2, -r * 0.45); g.lineTo(r * 1.0, -r * 0.85); g.lineTo(r * 1.5, -r * 0.4); g.fill();
  g.beginPath(); g.moveTo(r * 1.2, r * 0.45); g.lineTo(r * 1.0, r * 0.85); g.lineTo(r * 1.5, r * 0.4); g.fill();
  g.fillStyle = "#ff6a2a"; for (let k = 0; k < 4; k++) { g.globalAlpha = 0.3 + Math.random() * 0.3; g.beginPath(); g.arc((Math.random() - 0.5) * r * 2, (Math.random() - 0.5) * r, 1.5, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  const S = CHAR_SCALE;
  z.eyes = [z.x + (Math.cos(z.ang) * r * 1.75 + Math.cos(z.ang - 1.57) * 3) * S, z.y + (Math.sin(z.ang) * r * 1.75 + Math.sin(z.ang - 1.57) * 3) * S, z.x + (Math.cos(z.ang) * r * 1.75 + Math.cos(z.ang + 1.57) * 3) * S, z.y + (Math.sin(z.ang) * r * 1.75 + Math.sin(z.ang + 1.57) * 3) * S];
}

/* bodies on the ground (gritty style; in standard style zombies crumble to ash instead) */
function drawCorpse(g, c, t) {
  g.save(); g.translate(c.x, c.y); g.scale(CHAR_SCALE, CHAR_SCALE); g.rotate(c.a);
  g.globalAlpha = clamp(c.t / 2, 0, 1);
  if (c.soldier) {
    const op = OPERATORS.find((p) => p.id === c.op) || OPERATORS[0];
    g.fillStyle = shade(op.cloth, -0.2); g.beginPath(); g.ellipse(0, 0, 18, 9, 0, 0, TAU); g.fill();
    g.fillStyle = op.vest; rr(g, -8, -7, 14, 14, 3); g.fill();
    g.fillStyle = op.skin; g.beginPath(); g.arc(12, 0, 5.5, 0, TAU); g.fill();
    g.fillStyle = shade(op.cloth, -0.1); g.fillRect(-4, 8, 14, 4); g.fillRect(-2, -12, 12, 4);
  } else {
    const look = c.look || 0, shirt = ZSHIRT[look % ZSHIRT.length], skin = ZSKIN[(look >> 3) % ZSKIN.length];
    const big = c.zt === "brute" ? 1.6 : 1;
    g.scale(big, big);
    g.fillStyle = shade(shirt, -0.15); g.beginPath(); g.ellipse(0, 0, 17, 9, 0, 0, TAU); g.fill();
    g.fillStyle = skin; g.fillRect(-2, -13, 14, 4); g.fillRect(-6, 9, 14, 4);
    if (!c.gib) { g.fillStyle = skin; g.beginPath(); g.arc(13, 0, 6, 0, TAU); g.fill(); }
    else { g.fillStyle = "#5a0a0a"; g.beginPath(); g.arc(13, 0, 5, 0, TAU); g.fill(); }
  }
  g.restore();
}

/* weapon lying on the floor */
function drawDrop(g, d, t) {
  const def = wdef({ id: d.wid, up: d.up });
  g.save(); g.translate(d.x, d.y); g.rotate(d.a);
  const pulse = 0.5 + Math.sin(t * 4) * 0.25;
  g.strokeStyle = rgba(def.col || "#ffffff", 0.25 + pulse * 0.25); g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 18, 9, 0, 0, TAU); g.stroke();
  g.translate(-gunLen(def.cls) / 2, 0); drawGun(g, def.cls, def.upgraded ? def.col : null);
  g.restore();
}

/* the game's emblem: skull in crosshairs inside a shield with crossed rifles (title screen + app icon) */
function emblemSVG(o = {}) {
  const red = "#c8231b", bone = "#e9e2cf", ink = "#0e0f0e";
  const body = `
  <defs><linearGradient id="emS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f34"/><stop offset="1" stop-color="#15180f"/></linearGradient>
  <linearGradient id="emM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d2bd"/><stop offset="1" stop-color="#8f8a78"/></linearGradient></defs>
  <g stroke="${ink}" stroke-width="6" stroke-linejoin="round">
    <path d="M70 330 L330 70 M80 340 L340 80" stroke="#4a3a28" stroke-width="16"/>
    <path d="M330 330 L70 70 M320 340 L60 80" stroke="#4a3a28" stroke-width="16"/>
    <path d="M200 40 L330 85 L322 215 Q310 305 200 362 Q90 305 78 215 L70 85 Z" fill="url(#emS)"/>
    <path d="M200 58 L314 97 L307 212 Q296 290 200 342 Q104 290 93 212 L86 97 Z" fill="none" stroke="url(#emM)" stroke-width="5"/>
  </g>
  <g transform="translate(200 198)">
    <circle r="92" fill="none" stroke="${red}" stroke-width="7"/>
    <path d="M0 -120 V-70 M0 70 V120 M-120 0 H-70 M70 0 H120" stroke="${red}" stroke-width="8"/>
    <path d="M-52 -18 Q-54 -72 0 -76 Q54 -72 52 -18 Q50 8 34 18 L30 44 L-30 44 L-34 18 Q-50 8 -52 -18Z" fill="${bone}" stroke="${ink}" stroke-width="5"/>
    <path d="M-34 -16 Q-20 -30 -8 -14 Q-12 6 -30 4 Q-40 -4 -34 -16Z M34 -16 Q20 -30 8 -14 Q12 6 30 4 Q40 -4 34 -16Z" fill="${ink}"/>
    <path d="M0 10 L-7 24 L7 24Z" fill="${ink}"/>
    <path d="M-22 44 V32 M-11 44 V30 M0 44 V30 M11 44 V30 M22 44 V32" stroke="${ink}" stroke-width="4"/>
    <path d="M-60 -50 L-30 -20 M54 -58 L38 -40" stroke="${red}" stroke-width="5" opacity=".85"/>
  </g>`;
  if (o.raw) return body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${body}</svg>`;
}
