/* HUD drawn on the canvas: round counter, points, perks, power-up timers, weapon + ammo, USE prompt,
   Team Deathmatch score, minimap, kill feed, hit markers, announcements. Small text stays in the corners. */

const FONT_BIG = "'Black Ops One', Impact, sans-serif", FONT_UI = "'Chakra Petch', system-ui, sans-serif";

function drawHUD(ctx, G, views, t, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (const p of R.pops) p.t -= dt;
  R.pops = R.pops.filter((p) => p.t > 0);
  for (const x of R.toasts) x.life -= dt;
  R.toasts = R.toasts.filter((x) => x.life > 0);
  for (const f of R.feed) f.life -= dt;
  R.feed = R.feed.filter((f) => f.life > 0);
  if (R.announce) { R.announce.life -= dt; if (R.announce.life <= 0) R.announce = null; }
  for (let k = 0; k < 2; k++) { R.hit[k] = Math.max(0, R.hit[k] - dt); R.kill[k] = Math.max(0, R.kill[k] - dt); }
  for (const V of views) drawViewHUD(ctx, G, V, t);
  if (G.mode === "tdm") drawScore(ctx, G, views, t);
  // announcement (round number, power-ups, killstreaks): brief, high in the middle
  if (R.announce) {
    const A = R.announce, k = A.life / A.max, a = Math.min(1, k * 3, (1 - k) * 6);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const sz = clamp(CW * 0.045, 22, 42);
    ctx.font = `${sz}px ${FONT_BIG}`;
    ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 12;
    ctx.fillStyle = A.col; ctx.fillText(A.t, CW / 2, CH * 0.24);
    if (A.sub) { ctx.font = `600 ${Math.max(12, sz * 0.3)}px ${FONT_UI}`; ctx.fillStyle = "#f1ece0"; ctx.fillText(A.sub, CW / 2, CH * 0.24 + sz * 0.7); }
    ctx.restore();
  }
}

function hudPanel(ctx, x, y, w, h, a = 0.55) { ctx.fillStyle = `rgba(8,10,9,${a})`; rr(ctx, x, y, w, h, 6); ctx.fill(); }

function drawViewHUD(ctx, G, V, t) {
  const me = V.players[0];
  if (!me) return;
  const L = V.x0 + 12 + (V.x0 === 0 ? SAFE.l : 0), T = 10 + SAFE.t, Rr = V.x0 + V.w - 12 - (V.x0 + V.w >= CW - 1 ? SAFE.r : 0);
  const touch = IS_TOUCH && !G.demo;
  if (G.demo) return;
  ctx.textBaseline = "alphabetic";
  if (G.mode === "zombies") {
    const Z = G.z;
    // round counter (classic red numerals)
    const rs = clamp(V.h * 0.1, 30, 52);
    ctx.save(); ctx.font = `${rs}px ${FONT_BIG}`; ctx.textAlign = "left";
    ctx.shadowColor = "rgba(160,0,0,.6)"; ctx.shadowBlur = 10;
    const pulse = Z.phase === "break" ? 0.55 + Math.sin(t * 5) * 0.35 : 1;
    ctx.fillStyle = `rgba(200,30,22,${pulse})`;
    ctx.fillText(Z.round || "", L, T + rs);
    ctx.restore();
    // points of everyone in the game
    let py = T + rs + 22;
    const ps = ZM.players(G);
    ctx.font = `700 16px ${FONT_UI}`;
    for (const p of ps) {
      const mine = V.players.includes(p);
      const col = playerColor(G, p);
      hudPanel(ctx, L - 4, py - 15, 108, 21, mine ? 0.6 : 0.4);
      ctx.fillStyle = col; ctx.fillRect(L - 4, py - 15, 3, 21);
      ctx.fillStyle = p.alive ? (p.down ? "#ff6a5a" : "#f1ece0") : "#777";
      ctx.textAlign = "left"; ctx.fillText(p.points.toLocaleString(), L + 4, py);
      ctx.font = `600 10px ${FONT_UI}`; ctx.fillStyle = "rgba(241,236,224,.6)"; ctx.textAlign = "right"; ctx.fillText(p.name.toUpperCase().slice(0, 8), L + 100, py - 1); ctx.font = `700 16px ${FONT_UI}`;
      // +points popups
      if (mine) for (const pp of R.pops) if (pp.pid === (p.pidx >= 0 ? p.pidx : 0)) {
        const k = 1 - pp.t / 1.1;
        ctx.globalAlpha = Math.min(1, pp.t * 3); ctx.fillStyle = "#ffd23f"; ctx.textAlign = "left"; ctx.font = `700 13px ${FONT_UI}`;
        ctx.fillText("+" + pp.n, L + 108 + k * 26, py - 4 - k * 14); ctx.globalAlpha = 1; ctx.font = `700 16px ${FONT_UI}`;
      }
      // health bar + perks for local players
      if (mine) {
        ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(L - 4, py + 7, 108, 4);
        ctx.fillStyle = me.hp / me.maxHp < 0.35 ? "#ff3b2a" : "#d8d2c0"; ctx.fillRect(L - 4, py + 7, 108 * clamp(p.hp / p.maxHp, 0, 1), 4);
        let px = L + 6;
        for (const pk of p.perks) {
          const P = PERKS[pk];
          ctx.fillStyle = P.col; ctx.beginPath(); ctx.arc(px, py + 22, 8, 0, TAU); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = `bold 10px sans-serif`; ctx.textAlign = "center"; ctx.fillText(perkGlyph(pk), px, py + 26); ctx.font = `700 16px ${FONT_UI}`;
          px += 20;
        }
        if (p.perks.length) py += 18;
        py += 10;
      }
      py += 26;
    }
    // power-up timers
    let tx = V.x0 + V.w / 2 - 40;
    const act = Object.entries(Z.timers).filter(([, v]) => v > 0);
    tx = V.x0 + V.w / 2 - (act.length * 46) / 2 + 23;
    for (const [k, v] of act) {
      const P = POWERUPS[k === "double" ? "double" : k === "insta" ? "insta" : "sale"];
      const blink = v < 5 ? Math.sin(t * 14) > 0 : true;
      if (blink) {
        hudPanel(ctx, tx - 20, T + 2, 40, 34, 0.55);
        ctx.strokeStyle = P.col; ctx.lineWidth = 2; rr(ctx, tx - 20, T + 2, 40, 34, 6); ctx.stroke();
        ctx.fillStyle = P.col; ctx.font = `14px ${FONT_BIG}`; ctx.textAlign = "center"; ctx.fillText({ double: "x2", insta: "☠", sale: "$" }[k], tx, T + 20);
        ctx.font = `700 10px ${FONT_UI}`; ctx.fillStyle = "#f1ece0"; ctx.fillText(Math.ceil(v) + "s", tx, T + 32);
      }
      tx += 46;
    }
    // zombies left (small, under the round)
    if (Z.phase === "live" && !G.demo) {
      ctx.font = `600 10px ${FONT_UI}`; ctx.textAlign = "left"; ctx.fillStyle = "rgba(241,236,224,.55)";
      ctx.fillText(Math.max(0, Z.total - Z.killed) + " LEFT", L + rs * 0.95 * String(Z.round).length + 6, T + rs - 2);
    }
  }
  if (G.demo) return;
  // ---- weapon panel (bottom middle)
  for (let k = 0; k < V.players.length; k++) drawWeaponPanel(ctx, G, V, V.players[k], k, t);
  // ---- prompt
  for (let k = 0; k < V.players.length; k++) {
    const p = V.players[k]; if (!p || !p.prompt || !p.alive) continue;
    const pr = p.prompt;
    const cx = V.players.length > 1 ? V.x0 + V.w * (k ? 0.75 : 0.25) : V.x0 + V.w / 2, cy = V.y0 + V.h - SAFE.b - (touch ? 118 : 92);
    const txt = pr.label + (pr.cost ? "  " : "");
    ctx.font = `700 ${V.w < 500 ? 12 : 14}px ${FONT_UI}`; ctx.textAlign = "center";
    const tw = ctx.measureText(txt).width + (pr.cost ? ctx.measureText(String(pr.cost)).width + 12 : 0) + 40;
    hudPanel(ctx, cx - tw / 2, cy - 18, tw, 26, 0.7);
    const key = touch ? "" : "[F] ";
    ctx.fillStyle = pr.can ? "#f1ece0" : "rgba(241,236,224,.55)";
    const full = key + txt;
    const fw = ctx.measureText(full).width + (pr.cost ? ctx.measureText(String(pr.cost)).width : 0);
    let x0 = cx - fw / 2;
    ctx.textAlign = "left"; ctx.fillText(full, x0, cy);
    if (pr.cost) { ctx.fillStyle = pr.can ? "#ffd23f" : "#ff6a5a"; ctx.fillText(String(pr.cost), x0 + ctx.measureText(full).width, cy); }
    if (pr.sub) { ctx.font = `600 10px ${FONT_UI}`; ctx.fillStyle = "rgba(241,236,224,.7)"; ctx.textAlign = "center"; ctx.fillText(pr.sub, cx, cy + 20); }
    if (pr.hold && p.holdT > 0) { ctx.fillStyle = "rgba(255,210,63,.85)"; ctx.fillRect(cx - tw / 2 + 4, cy + 5, (tw - 8) * clamp(p.holdT / pr.hold, 0, 1), 3); }
  }
  // ---- toasts
  let ty = V.y0 + V.h - SAFE.b - (IS_TOUCH ? 150 : 124);
  ctx.font = `600 12px ${FONT_UI}`; ctx.textAlign = "center";
  for (const x of R.toasts) {
    if (x.pid && !V.players.some((p) => p && p.id === x.pid)) continue;
    ctx.globalAlpha = Math.min(1, x.life * 2);
    const w = ctx.measureText(x.t).width + 20;
    hudPanel(ctx, V.x0 + V.w / 2 - w / 2, ty - 14, w, 20, 0.6);
    ctx.fillStyle = "#f1ece0"; ctx.fillText(x.t, V.x0 + V.w / 2, ty);
    ctx.globalAlpha = 1; ty -= 24;
  }
  // ---- downed / dead messages
  if (me.down && G.mode === "zombies") {
    ctx.textAlign = "center"; ctx.font = `${clamp(V.w * 0.04, 18, 30)}px ${FONT_BIG}`; ctx.fillStyle = "#ff4a3a";
    ctx.fillText(me.selfRev > 0 ? "SECOND WIND…" : "YOU'RE DOWN", V.x0 + V.w / 2, V.y0 + V.h * 0.38);
    if (!me.selfRev) { ctx.font = `600 12px ${FONT_UI}`; ctx.fillStyle = "#f1ece0"; ctx.fillText("Keep shooting · your teammate can revive you · " + Math.ceil(me.bleed) + "s", V.x0 + V.w / 2, V.y0 + V.h * 0.38 + 22); }
  }
  if (!me.alive && G.mode === "tdm" && !G.over) {
    ctx.textAlign = "center"; ctx.font = `${clamp(V.w * 0.045, 20, 34)}px ${FONT_BIG}`; ctx.fillStyle = "#f1ece0";
    ctx.fillText("RESPAWNING " + Math.max(1, Math.ceil(me.respawnT)), V.x0 + V.w / 2, V.y0 + V.h * 0.42);
  }
  if (!me.alive && G.mode === "zombies" && !G.over) {
    ctx.textAlign = "center"; ctx.font = `${clamp(V.w * 0.04, 18, 30)}px ${FONT_BIG}`; ctx.fillStyle = "#c8231b";
    ctx.fillText("YOU BLED OUT", V.x0 + V.w / 2, V.y0 + V.h * 0.38);
    ctx.font = `600 12px ${FONT_UI}`; ctx.fillStyle = "#f1ece0"; ctx.fillText("You'll be back next round if your teammate survives", V.x0 + V.w / 2, V.y0 + V.h * 0.38 + 22);
  }
  // teammate down marker at the screen edge
  if (G.mode === "zombies") for (const b of ZM.players(G)) {
    if (V.players.includes(b) || !b.down || !b.alive || !V.cam) continue;
    const sx = V.x0 + V.w / 2 + (b.x - V.cam.x) * V.cam.z, sy = V.y0 + V.h / 2 + (b.y - V.cam.y) * V.cam.z;
    const cx = clamp(sx, V.x0 + 30, V.x0 + V.w - 30), cy = clamp(sy, V.y0 + 40, V.y0 + V.h - 40);
    ctx.fillStyle = Math.sin(t * 8) > 0 ? "#ff4a3a" : "#fff"; ctx.font = `bold 18px sans-serif`; ctx.textAlign = "center"; ctx.fillText("✚", cx, cy);
    ctx.font = `600 10px ${FONT_UI}`; ctx.fillText(Math.round(dist(me.x, me.y, b.x, b.y) / 40) + "m", cx, cy + 14);
  }
  // hit / kill markers near the aim point
  for (let k = 0; k < V.players.length; k++) {
    const p = V.players[k]; if (!p || !V.cam) continue;
    const pid = p.pidx >= 0 ? p.pidx : 0;
    if (R.hit[pid] <= 0 && R.kill[pid] <= 0) continue;
    const ax = V.x0 + V.w / 2 + (p.x + Math.cos(p.ang) * 70 - V.cam.x) * V.cam.z, ay = V.y0 + V.h / 2 + (p.y + Math.sin(p.ang) * 70 - V.cam.y) * V.cam.z;
    const kill = R.kill[pid] > 0;
    ctx.strokeStyle = kill ? "#ff3b2a" : "rgba(255,255,255,.9)"; ctx.lineWidth = kill ? 2.5 : 1.8;
    const s = kill ? 9 : 6;
    ctx.beginPath(); ctx.moveTo(ax - s, ay - s); ctx.lineTo(ax - s / 3, ay - s / 3); ctx.moveTo(ax + s, ay - s); ctx.lineTo(ax + s / 3, ay - s / 3); ctx.moveTo(ax - s, ay + s); ctx.lineTo(ax - s / 3, ay + s / 3); ctx.moveTo(ax + s, ay + s); ctx.lineTo(ax + s / 3, ay + s / 3); ctx.stroke();
  }
  // mouse crosshair (desktop)
  if (!IS_TOUCH && Input.mouse && Input.mouse.on && V.players[0] && V.players[0].pidx === 0 && !Input.split2k) {
    const mx = Input.mouse.x, my = Input.mouse.y;
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.5;
    const sp = 5 + curDef(me).spread * 60 + me.spreadAdd * 80;
    ctx.beginPath(); ctx.moveTo(mx - sp - 6, my); ctx.lineTo(mx - sp, my); ctx.moveTo(mx + sp, my); ctx.lineTo(mx + sp + 6, my); ctx.moveTo(mx, my - sp - 6); ctx.lineTo(mx, my - sp); ctx.moveTo(mx, my + sp); ctx.lineTo(mx, my + sp + 6); ctx.stroke();
  }
  if (G.mode === "tdm") { drawMinimap(ctx, G, V, me, Rr, T + (SAFE.t ? 0 : 0), t); drawFeed(ctx, G, V, Rr, t); }
}

function drawWeaponPanel(ctx, G, V, p, k, t) {
  if (!p || !p.alive) return;
  const touch = IS_TOUCH;
  const slot = curSlot(p), d = wdef(slot);
  const two = V.players.length > 1;
  const w = two ? 150 : 190, h = 46;
  const cx = two ? V.x0 + V.w * (k ? 0.75 : 0.25) : V.x0 + V.w / 2;
  const y = V.y0 + V.h - h - 8 - SAFE.b;
  const x = cx - w / 2;
  p.hudBox = { x, y, w, h };       // tap the panel to swap weapons
  hudPanel(ctx, x, y, w, h, 0.6);
  ctx.textAlign = "left";
  ctx.font = `700 11px ${FONT_UI}`; ctx.fillStyle = d.upgraded ? d.col : "rgba(241,236,224,.85)";
  ctx.fillText(d.name.toUpperCase(), x + 10, y + 15);
  ctx.font = `20px ${FONT_BIG}`;
  ctx.fillStyle = slot.mag === 0 ? "#ff4a3a" : "#f1ece0";
  ctx.fillText(slot.mag, x + 10, y + 38);
  const mw = ctx.measureText(String(slot.mag)).width;
  ctx.font = `600 12px ${FONT_UI}`; ctx.fillStyle = "rgba(241,236,224,.6)"; ctx.fillText("/ " + slot.res, x + 14 + mw, y + 38);
  // reload bar
  if (p.reloadT > 0) { ctx.fillStyle = "rgba(255,210,63,.85)"; ctx.fillRect(x + 8, y + h - 5, (w - 16) * (1 - p.reloadT / p.reloadDur), 3); ctx.font = `700 10px ${FONT_UI}`; ctx.fillStyle = "#ffd23f"; ctx.textAlign = "right"; ctx.fillText("RELOADING", x + w - 10, y + 15); }
  else if (slot.mag <= Math.ceil(d.mag * 0.2) && slot.res > 0) { ctx.font = `700 10px ${FONT_UI}`; ctx.fillStyle = "#ffd23f"; ctx.textAlign = "right"; ctx.fillText(touch ? "TAP ⟳ RELOAD" : "[R] RELOAD", x + w - 10, y + 15); }
  // frags + other weapon
  ctx.textAlign = "right";
  for (let f = 0; f < p.frags; f++) { ctx.fillStyle = "#6f7a52"; ctx.beginPath(); ctx.arc(x + w - 12 - f * 11, y + 33, 4, 0, TAU); ctx.fill(); }
  const other = p.weapons[1 - p.cur];
  if (other && p.reloadT <= 0 && !(slot.mag <= Math.ceil(d.mag * 0.2) && slot.res > 0)) { ctx.font = `600 9px ${FONT_UI}`; ctx.fillStyle = "rgba(241,236,224,.5)"; ctx.fillText((touch ? "⇄ " : "[Q] ") + wdef(other).name.toUpperCase(), x + w - 10, y + 15); }
  if (G.mode === "tdm") {
    const next = STREAKS.find((s) => s.kills > p.streak);
    ctx.font = `600 9px ${FONT_UI}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(241,236,224,.55)";
    ctx.fillText(next ? `STREAK ${p.streak} · ${next.name} AT ${next.kills}` : `STREAK ${p.streak}`, cx, y - 5);
  }
}

function drawScore(ctx, G, views, t) {
  const T = G.t, cx = CW / 2, y = 8 + SAFE.t;
  const w = 210;
  hudPanel(ctx, cx - w / 2, y, w, 34, 0.65);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = `22px ${FONT_BIG}`;
  ctx.fillStyle = TEAM_COL[0]; ctx.fillText(T.score[0], cx - 62, y + 26);
  ctx.fillStyle = TEAM_COL[1]; ctx.fillText(T.score[1], cx + 62, y + 26);
  const s = Math.max(0, Math.ceil(T.timeLeft)), mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, "0");
  ctx.font = `700 14px ${FONT_UI}`; ctx.fillStyle = T.timeLeft < 30 ? "#ff6a5a" : "#f1ece0"; ctx.fillText(mm + ":" + ss, cx, y + 16);
  ctx.font = `600 8px ${FONT_UI}`; ctx.fillStyle = "rgba(241,236,224,.6)"; ctx.fillText("FIRST TO " + T.limit, cx, y + 28);
  for (let k = 0; k < 2; k++) { ctx.fillStyle = rgba(TEAM_COL[k], 0.85); const bw = 80 * clamp(T.score[k] / T.limit, 0, 1); ctx.fillRect(k ? cx + 22 : cx - 22 - bw, y + 31, bw, 3); }
}

function minimapCanvas(G) {
  if (G._mini) return G._mini;
  const m = G.map, s = 3, c = makeCanvas(m.W * s, m.H * s), g = c.getContext("2d");
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const tl = m.tile[y * m.W + x];
    g.fillStyle = tl === T_WALL ? "rgba(220,220,210,.7)" : tl === T_HIGH || tl === T_TREE ? "rgba(160,160,150,.45)" : tl === T_FENCE || tl === T_WINDOW ? "rgba(200,200,190,.35)" : "rgba(40,44,40,.55)";
    g.fillRect(x * s, y * s, s, s);
  }
  G._mini = c; return c;
}
function drawMinimap(ctx, G, V, me, right, top, t) {
  const m = G.map, mc = minimapCanvas(G);
  const w = clamp(V.w * 0.2, 100, 168), h = w * (m.H / m.W);
  const x = right - w - (V.x0 + V.w >= CW - 1 && IS_TOUCH ? 34 : 0), y = top;
  ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(mc, x, y, w, h); ctx.restore();
  ctx.strokeStyle = "rgba(241,236,224,.35)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
  const sx = w / m.pw, sy = h / m.ph;
  for (const a of G.actors) {
    if (a.kind !== "soldier" || !a.alive) continue;
    const mine = a === me;
    const ally = a.team === me.team;
    const show = ally || G.t.recon[me.team] > 0 || G.time - a.lastShot < 1.5;
    if (!show) continue;
    ctx.fillStyle = mine ? "#fff" : ally ? TEAM_COL[me.team] : TEAM_COL[1 - me.team];
    if (mine) { ctx.save(); ctx.translate(x + a.x * sx, y + a.y * sy); ctx.rotate(a.ang); ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -3.5); ctx.lineTo(-3, 3.5); ctx.closePath(); ctx.fill(); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(x + a.x * sx, y + a.y * sy, a.human ? 3 : 2.4, 0, TAU); ctx.fill(); }
  }
  if (G.t.recon[me.team] > 0) { ctx.font = `700 9px ${FONT_UI}`; ctx.fillStyle = "#7affb4"; ctx.textAlign = "right"; ctx.fillText("RECON " + Math.ceil(G.t.recon[me.team]) + "s", x + w, y + h + 11); }
  V.mmBottom = y + h + 14;
}
function drawFeed(ctx, G, V, right, t) {
  let y = (V.mmBottom || 100) + 10;
  ctx.font = `600 10px ${FONT_UI}`; ctx.textAlign = "right";
  for (const f of R.feed) {
    const e = f.e;
    ctx.globalAlpha = Math.min(1, f.life);
    const txt = (e.a ? e.a + "  " : "") + "[" + e.w + (e.crit ? " ✛" : "") + "]  " + e.v;
    const w = ctx.measureText(txt).width + 12;
    hudPanel(ctx, right - w - (IS_TOUCH && V.x0 + V.w >= CW - 1 ? 34 : 0), y - 11, w, 15, 0.45);
    let x = right - 6 - (IS_TOUCH && V.x0 + V.w >= CW - 1 ? 34 : 0);
    ctx.fillStyle = e.vt >= 0 ? TEAM_COL[e.vt] : "#fff"; ctx.fillText(e.v, x, y); x -= ctx.measureText(e.v).width;
    const mid = "  [" + e.w + (e.crit ? " ✛" : "") + "]  ";
    ctx.fillStyle = "rgba(241,236,224,.7)"; ctx.fillText(mid, x, y); x -= ctx.measureText(mid).width;
    if (e.a) { ctx.fillStyle = e.at >= 0 ? TEAM_COL[e.at] : "#fff"; ctx.fillText(e.a, x, y); }
    ctx.globalAlpha = 1;
    y += 17;
  }
}
