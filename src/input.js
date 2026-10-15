/* Controls.
   Touch: left thumb = move stick (appears where you touch), right thumb = aim stick (drag to aim, it fires while you aim;
   a quick tap fires at the nearest enemy in front of you). Buttons by the right thumb: RELOAD, GRENADE, KNIFE, and USE
   when there's something to buy or do. Tap the weapon panel to swap guns. Two players on one screen: each gets half.
   Keyboard + mouse: WASD move, mouse aim, click fire, R reload, F or E use, G or right-click grenade, V knife, Q swap.
   Two players on one keyboard: P1 WASD + Space fire, P2 arrows + L fire (both auto-aim). */

const Input = {
  players: [mkPI(), mkPI()], touches: {}, layout: null, keys: {}, enabled: false, n: 1, split: false,
  mouse: { x: 0, y: 0, on: false, down: false, t: 0 }, aimActive: [false, false], split2k: false, onPause: null,
};
function mkPI() { return { move: [0, 0], aim: null, fire: false, tap: 0, mT: null, aT: null, mA: null, aA: null, mK: null, aK: null, e: { reload: 0, use: 0, knife: 0, gren: 0, swap: 0 }, useHold: false, btn: {} }; }

function computeLayout(W, H, n, safe) {
  const L = { W, H, n, players: [] };
  for (let p = 0; p < n; p++) {
    const x0 = n > 1 ? (p * W) / 2 : 0, w = n > 1 ? W / 2 : W;
    const R = clamp(Math.min(w * 0.075, H * 0.1), 24, 50) * (n > 1 ? 0.92 : 1);
    const pad = Math.max(16, R * 0.4);
    const sl = p === 0 ? safe.l : 0, sr = p === n - 1 ? safe.r : 0;
    const by = H - pad - R * 1.5 - safe.b;
    const moveG = { x: x0 + sl + pad + R * 1.5, y: by };
    const aimG = { x: x0 + w - sr - pad - R * 1.5, y: by };
    const b = (dx, dy, k = 0.62) => ({ x: aimG.x + dx * R, y: aimG.y + dy * R, r: R * k });
    L.players.push({
      x0, w, R, moveG, aimG,
      reload: b(-2.45, 0.55), gren: b(-2.05, -1.55), knife: b(-0.2, -2.35), use: b(-3.1, -2.4, 0.82),
      moveZone: { x: x0 + sl, y: H * 0.18, w: w * 0.44, h: H * 0.82 },
      aimZone: { x: x0 + w * 0.44, y: H * 0.18, w: w * 0.56, h: H * 0.82 },
    });
  }
  L.pause = { x: W - 24 - safe.r, y: 22 + safe.t, r: 17 };
  return L;
}
const inCircle = (b, x, y, k = 1.25) => (x - b.x) * (x - b.x) + (y - b.y) * (y - b.y) < b.r * k * b.r * k;
const inRect = (z, x, y) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

function touchRole(x, y) {
  const L = Input.layout; if (!L) return null;
  if (inCircle(L.pause, x, y, 1.5)) return { role: "pause" };
  for (let p = 0; p < L.players.length; p++) {
    const P = L.players[p];
    if (x < P.x0 || x > P.x0 + P.w) continue;
    const I = Input.players[p];
    if (I.useShown && inCircle(P.use, x, y, 1.2)) return { role: "use", p };
    if (inCircle(P.reload, x, y)) return { role: "reload", p };
    if (inCircle(P.gren, x, y)) return { role: "gren", p };
    if (inCircle(P.knife, x, y)) return { role: "knife", p };
    // weapon panel → swap
    const me = Input.me && Input.me[p];
    if (me && me.hudBox && inRect(me.hudBox, x, y)) return { role: "swap", p };
    if (inRect(P.moveZone, x, y)) return { role: "move", p };
    if (inRect(P.aimZone, x, y)) return { role: "aim", p };
    if (x < P.x0 + P.w * 0.44) return { role: "move", p };
    return { role: "aim", p };
  }
  return null;
}

function initInput(canvas) {
  const pt = (t) => { const r = canvas.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
  const start = (e) => {
    if (!Input.enabled) return;
    e.preventDefault();
    SFX.unlock();
    for (const t of e.changedTouches) {
      const [x, y] = pt(t);
      const role = touchRole(x, y);
      if (!role) continue;
      Input.touches[t.identifier] = Object.assign(role, { sx: x, sy: y, x, y, t0: now() });
      if (role.role === "pause") { Input.onPause && Input.onPause(); continue; }
      const P = Input.players[role.p];
      switch (role.role) {
        case "move": P.mT = t.identifier; P.mA = [x, y]; P.mK = [x, y]; break;
        case "aim": P.aT = t.identifier; P.aA = [x, y]; P.aK = [x, y]; break;
        case "reload": P.e.reload++; P.btn.reload = true; break;
        case "gren": P.e.gren++; P.btn.gren = true; break;
        case "knife": P.e.knife++; P.btn.knife = true; break;
        case "use": P.e.use++; P.useHold = true; P.btn.use = true; break;
        case "swap": P.e.swap++; break;
      }
    }
  };
  const move = (e) => {
    if (!Input.enabled) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const T = Input.touches[t.identifier]; if (!T) continue;
      const [x, y] = pt(t); T.x = x; T.y = y;
      const P = Input.players[T.p], Lp = Input.layout.players[T.p];
      if (T.role === "move" && P.mA) {
        let dx = x - P.mA[0], dy = y - P.mA[1], d = Math.hypot(dx, dy), R = Lp.R;
        // the stick follows your thumb if you drag past its edge
        if (d > R * 1.25) { P.mA[0] = x - (dx / d) * R * 1.25; P.mA[1] = y - (dy / d) * R * 1.25; dx = x - P.mA[0]; dy = y - P.mA[1]; d = R * 1.25; }
        P.mK = [x, y];
        const m = clamp(d / R, 0, 1), dz = 0.12;
        P.move = d < 2 ? [0, 0] : [(dx / d) * (m < dz ? 0 : (m - dz) / (1 - dz)), (dy / d) * (m < dz ? 0 : (m - dz) / (1 - dz))];
      }
      if (T.role === "aim" && P.aA) {
        let dx = x - P.aA[0], dy = y - P.aA[1], d = Math.hypot(dx, dy), R = Lp.R;
        if (d > R * 1.3) { P.aA[0] = x - (dx / d) * R * 1.3; P.aA[1] = y - (dy / d) * R * 1.3; dx = x - P.aA[0]; dy = y - P.aA[1]; d = R * 1.3; }
        P.aK = [x, y];
        if (d > R * 0.16) { P.aim = Math.atan2(dy, dx); P.fire = d > R * 0.3; Input.aimActive[T.p] = true; }
      }
    }
  };
  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const T = Input.touches[t.identifier]; if (!T) continue;
      delete Input.touches[t.identifier];
      const P = Input.players[T.p]; if (!P) continue;
      if (T.role === "move") { P.mT = null; P.mA = null; P.mK = null; P.move = [0, 0]; }
      if (T.role === "aim") {
        if (now() - T.t0 < 0.22 && Math.hypot(T.x - T.sx, T.y - T.sy) < 14) P.tap = 0.14;   // quick tap = shoot at the closest thing in front
        P.aT = null; P.aA = null; P.aK = null; P.fire = false; Input.aimActive[T.p] = false;
      }
      if (T.role === "use") { P.useHold = false; P.btn.use = false; }
      for (const b of ["reload", "gren", "knife"]) if (T.role === b) P.btn[b] = false;
    }
  };
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end, { passive: false });
  canvas.addEventListener("touchcancel", end, { passive: false });

  // mouse (desktop): aim + fire for player 1
  canvas.addEventListener("mousemove", (e) => { const r = canvas.getBoundingClientRect(); Input.mouse.x = e.clientX - r.left; Input.mouse.y = e.clientY - r.top; Input.mouse.on = true; Input.mouse.t = now(); });
  canvas.addEventListener("mousedown", (e) => {
    if (!Input.enabled) return;
    SFX.unlock();
    if (e.button === 0) Input.mouse.down = true;
    if (e.button === 2) Input.players[0].e.gren++;
    if (e.button === 1) Input.players[0].e.knife++;
    Input.mouse.on = true;
    // clicking the weapon panel swaps
    const me = Input.me && Input.me[0];
    if (me && me.hudBox && inRect(me.hudBox, Input.mouse.x, Input.mouse.y)) { Input.players[0].e.swap++; Input.mouse.down = false; }
    if (Input.layout && inCircle(Input.layout.pause, Input.mouse.x, Input.mouse.y, 1.5) && IS_TOUCH) Input.onPause && Input.onPause();
  });
  window.addEventListener("mouseup", (e) => { if (e.button === 0) Input.mouse.down = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", (e) => { if (Input.enabled) Input.players[0].e.swap++; }, { passive: true });

  const KEYS = {
    // player 1
    KeyR: [0, "reload"], KeyF: [0, "use"], KeyE: [0, "use"], KeyG: [0, "gren"], KeyV: [0, "knife"], KeyQ: [0, "swap"], Digit1: [0, "swap"], Digit2: [0, "swap"], Tab: [0, "swap"],
    // player 2 (two on one keyboard)
    KeyU: [1, "reload"], KeyO: [1, "use"], KeyK: [1, "gren"], KeyJ: [1, "knife"], KeyI: [1, "swap"],
  };
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" || e.code === "KeyP") { if (Input.enabled) Input.onPause && Input.onPause(); return; }
    if (!Input.enabled) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    SFX.unlock();
    if (Input.keys[e.code]) return;
    Input.keys[e.code] = true;
    let m = KEYS[e.code];
    if (e.code === "Space" && !Input.split2k) m = [0, "knife"];
    if (!m) return;
    const p = Input.split2k ? m[0] : 0;
    if (m[0] === 1 && !Input.split2k) return;
    const P = Input.players[p];
    if (m[1] === "use") { P.e.use++; P.useHoldK = true; }
    else P.e[m[1]]++;
  });
  window.addEventListener("keyup", (e) => { Input.keys[e.code] = false; });
  window.addEventListener("blur", () => { Input.keys = {}; Input.mouse.down = false; });
}

/* Snapshot of player p's controls for this simulation step. G is used for auto-aim and aim assist. */
function readPlayer(p, G, me) {
  const P = Input.players[p], k = Input.keys;
  const out = { mx: 0, my: 0, aim: null, fire: false, reload: P.e.reload > 0, use: P.e.use > 0, knife: P.e.knife > 0, gren: P.e.gren > 0, swap: P.e.swap > 0, useHold: false, grenDist: 280 };
  // touch
  out.mx = P.move[0]; out.my = P.move[1];
  if (P.aim !== null && P.aT !== null) { out.aim = P.aim; out.fire = P.fire; }
  out.useHold = P.useHold;
  // keyboard
  const two = Input.split2k;
  const set = two ? (p === 0 ? { u: ["KeyW"], d: ["KeyS"], l: ["KeyA"], r: ["KeyD"], fire: ["Space"] } : { u: ["ArrowUp"], d: ["ArrowDown"], l: ["ArrowLeft"], r: ["ArrowRight"], fire: ["KeyL", "Enter"] })
    : { u: ["KeyW", "ArrowUp"], d: ["KeyS", "ArrowDown"], l: ["KeyA", "ArrowLeft"], r: ["KeyD", "ArrowRight"], fire: [] };
  const any = (a) => a.some((c) => k[c]);
  const kx = (any(set.r) ? 1 : 0) - (any(set.l) ? 1 : 0), ky = (any(set.d) ? 1 : 0) - (any(set.u) ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); out.mx = kx / l; out.my = ky / l; }
  if (two && any(set.fire)) out.fire = true;
  if (P.useHoldK) { out.useHold = p === 0 ? !!(k.KeyF || k.KeyE) : !!k.KeyO; if (!out.useHold) P.useHoldK = false; }
  // mouse aim for player 1
  if (p === 0 && !IS_TOUCH && Input.mouse.on && me && G && Input.view0) {
    const V = Input.view0, wx = V.cam.x + (Input.mouse.x - V.x0 - V.w / 2) / V.cam.z, wy = V.cam.y + (Input.mouse.y - V.y0 - V.h / 2) / V.cam.z;
    out.aim = Math.atan2(wy - me.y, wx - me.x);
    if (Input.mouse.down) out.fire = true;
    out.grenDist = dist(me.x, me.y, wx, wy);
    Input.aimActive[0] = false;
  }
  // keyboard-only players: auto-aim at the nearest enemy in front while firing
  if (G && me && out.fire && (two || (!IS_TOUCH && !Input.mouse.on)) && out.aim === null) {
    const facing = Math.hypot(out.mx, out.my) > 0.2 ? Math.atan2(out.my, out.mx) : me.ang;
    const a = autoAim(G, me, facing);
    out.aim = a !== null ? a : facing;
  }
  // quick tap: shoot the closest enemy roughly where you're facing
  if (P.tap > 0 && G && me) {
    const a = autoAim(G, me, me.ang, 700, 1.0);
    out.aim = a !== null ? a : me.ang; out.fire = true; P.tap -= STEP;
  }
  // thumbs get a little help aiming
  if (G && me && out.aim !== null && IS_TOUCH && App.save.settings.assist !== false && P.aT !== null) out.aim = aimAssist(G, me, out.aim, 0.16);
  if (out.gren && me && G && out.aim === null && IS_TOUCH) { const a = autoAim(G, me, me.ang, 460, 0.9); if (a !== null) { const tg = G.actors.find((b) => targetable(G, me, b) && Math.abs(angDiff(angTo(me.x, me.y, b.x, b.y), a)) < 0.01); if (tg) out.grenDist = dist(me.x, me.y, tg.x, tg.y); } }
  return out;
}
function consumeEdges(p) { const P = Input.players[p]; for (const k in P.e) P.e[k] = 0; }
function resetInput() { Input.players = [mkPI(), mkPI()]; Input.touches = {}; Input.keys = {}; Input.aimActive = [false, false]; Input.mouse.down = false; }

/* ---------------- on-screen controls ---------------- */
function drawControls(ctx, G, views) {
  const L = Input.layout;
  if (!L || !IS_TOUCH || G.demo) return;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  for (let p = 0; p < L.players.length; p++) {
    const P = L.players[p], I = Input.players[p];
    const me = Input.me && Input.me[p];
    if (!me) continue;
    // sticks
    stick(ctx, I.mA || [P.moveG.x, P.moveG.y], I.mK, P.R, !!I.mA, "MOVE");
    stick(ctx, I.aA || [P.aimG.x, P.aimG.y], I.aK, P.R, !!I.aA, "AIM · FIRE", true);
    const alive = me.alive && !me.down;
    cbtn(ctx, P.reload, "⟳", "RELOAD", I.btn.reload, alive && me.reloadT <= 0, me.reloadT > 0 ? 1 - me.reloadT / me.reloadDur : null);
    cbtn(ctx, P.gren, "●", "GRENADE ×" + me.frags, I.btn.gren, alive && me.frags > 0);
    cbtn(ctx, P.knife, "⚔", "KNIFE", I.btn.knife, alive && me.knifeCD <= 0);
    I.useShown = !!(me.prompt && alive);
    if (I.useShown) {
      const pr = me.prompt, b = P.use;
      const pulse = 1 + Math.sin(now() * 6) * 0.05;
      ctx.save();
      ctx.fillStyle = pr.can ? "rgba(255,210,63,.88)" : "rgba(120,110,90,.7)";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)"; ctx.lineWidth = 2; ctx.stroke();
      if (pr.hold && me.holdT > 0) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(me.holdT / pr.hold, 0, 1)); ctx.stroke(); }
      ctx.fillStyle = "#14120c"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${b.r * 0.42}px ${FONT_BIG}`; ctx.fillText(pr.hold ? "HOLD" : "USE", b.x, b.y - (pr.cost ? b.r * 0.15 : 0));
      if (pr.cost) { ctx.font = `700 ${b.r * 0.3}px ${FONT_UI}`; ctx.fillText(pr.cost, b.x, b.y + b.r * 0.32); }
      ctx.restore();
    }
  }
  // pause
  const pz = L.pause;
  ctx.fillStyle = "rgba(10,12,10,.55)"; ctx.beginPath(); ctx.arc(pz.x, pz.y, pz.r, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f1ece0"; ctx.fillRect(pz.x - 6, pz.y - 7, 4, 14); ctx.fillRect(pz.x + 2, pz.y - 7, 4, 14);
}
function stick(ctx, a, k, R, active, label, red) {
  ctx.save();
  ctx.globalAlpha = active ? 0.75 : 0.32;
  ctx.strokeStyle = red && active ? "rgba(255,90,70,.9)" : "rgba(241,236,224,.8)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(a[0], a[1], R, 0, TAU); ctx.stroke();
  ctx.fillStyle = "rgba(241,236,224,.08)"; ctx.fill();
  const kx = k ? k[0] : a[0], ky = k ? k[1] : a[1];
  ctx.fillStyle = red && active ? "rgba(255,90,70,.8)" : "rgba(241,236,224,.75)";
  ctx.beginPath(); ctx.arc(kx, ky, R * 0.42, 0, TAU); ctx.fill();
  if (!active) { ctx.globalAlpha = 0.5; ctx.fillStyle = "#f1ece0"; ctx.font = `600 ${Math.max(8, R * 0.22)}px ${FONT_UI}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, a[0], a[1] + R + 10); }
  ctx.restore();
}
function cbtn(ctx, b, glyph, label, down, enabled, prog) {
  ctx.save();
  ctx.globalAlpha = enabled ? (down ? 0.95 : 0.7) : 0.3;
  ctx.fillStyle = "rgba(10,12,10,.6)"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = down ? "#ffd23f" : "rgba(241,236,224,.7)"; ctx.lineWidth = down ? 3 : 1.5; ctx.stroke();
  if (prog !== null && prog !== undefined) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke(); }
  ctx.fillStyle = "#f1ece0"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${b.r * 0.8}px sans-serif`; ctx.fillText(glyph, b.x, b.y + 1);
  ctx.font = `600 ${Math.max(7, b.r * 0.27)}px ${FONT_UI}`; ctx.fillText(label, b.x, b.y + b.r + 8);
  ctx.restore();
}
