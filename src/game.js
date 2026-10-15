/* Core simulation shared by every mode: actors, weapons, bullets, grenades, explosions, damage, pickups, interactions.
   Modes plug in through zombies.js (ZM.*) and tdm.js (TD.*). Nothing here touches the DOM.
   Visual + sound events go into G.vev (rendered locally and forwarded to an online guest). */

const SOLDIER_R = 13, SOLDIER_SPEED = 172;

/* Weapon definition for a carried slot (merges the Forge upgrade). */
const _upCache = {};
function wdef(slot) {
  const base = WEAPONS[slot.id];
  if (!slot.up || !base.up) return base;
  return _upCache[slot.id] || (_upCache[slot.id] = Object.assign({}, base, base.up, { baseName: base.name, upgraded: true }));
}
function newSlot(id, up = false) { const d = wdef({ id, up }); return { id, up, mag: d.mag, res: d.res }; }

function newMatch(cfg) {
  const def = MAP_DEFS.find((d) => d.id === cfg.mapId) || MAP_DEFS[0];
  const map = parseMap(def);
  initWorld(map, cfg.mode);
  const G = {
    cfg, mode: cfg.mode, map, time: 0, frame: 0, actors: [], nextId: 1, hash: makeHash(map), projs: [], drops: [], powerups: [], zones: [],
    vev: [], humans: [], over: false, overT: 0, winner: null, demo: !!cfg.demo, net: null, msgs: [], seed: cfg.seed || 1,
  };
  if (cfg.mode === "zombies") ZM.init(G); else TD.init(G);
  if (cfg.sameScreen && !cfg.split) G.leash = TD.leash;
  return G;
}

/* ---------------- actors ---------------- */
function makeSoldier(G, o) {
  const op = OPERATORS.find((p) => p.id === o.op) || OPERATORS[0];
  const a = {
    id: G.nextId++, kind: "soldier", team: o.team || 0, human: !!o.human, pidx: o.pidx === undefined ? -1 : o.pidx, remote: !!o.remote, netId: o.netId,
    name: o.name || op.name, op: op.id, x: o.x, y: o.y, vx: 0, vy: 0, r: SOLDIER_R, ang: o.ang || 0, moveAng: 0, walk: 0,
    hp: o.hp || 100, maxHp: o.hp || 100, alive: true, down: false, bleed: 0, hurtT: -99, protectT: 0, respawnT: 0,
    weapons: o.weapons || [newSlot("p9")], cur: 0, fireCD: 0, reloadT: 0, reloadDur: 0, swapT: 0, spreadAdd: 0, firing: false, lastShot: -99,
    frags: o.frags === undefined ? 2 : o.frags, gCD: 0, knifeCD: 0, knifeT: 0, perks: [], points: 0, kills: 0, deaths: 0, assists: 0, streak: 0, bestStreak: 0, crits: 0,
    downs: 0, revives: 0, windUses: 0, prompt: null, holdT: 0, holdKey: null, bot: o.bot || null, recoil: 0, flash: 0, light: true, stats: { shots: 0, hits: 0 },
  };
  G.actors.push(a);
  if (a.human) G.humans.push(a);
  return a;
}
function curSlot(a) { return a.weapons[a.cur] || a.weapons[0]; }
function curDef(a) { return wdef(curSlot(a)); }
function hasPerk(a, p) { return a.perks.includes(p); }
function isEnemy(G, a, b) {
  if (a === b || !b.alive) return false;
  if (G.mode === "zombies") return (a.kind === "zombie") !== (b.kind === "zombie");
  return b.kind === "soldier" && a.team !== b.team;
}
// can `b` be hit by `a`'s attacks right now
function targetable(G, a, b) { return isEnemy(G, a, b) && !(b.kind === "soldier" && b.down) && !(b.protectT > 0) && !(b.rise > 0.6); }

function ev(G, e) { G.vev.push(e); return e; }
function snd(G, s, x, y, v = 1) { G.vev.push({ k: "snd", s, x, y, v }); }

/* ---------------- step ---------------- */
function stepMatch(G, inputs, dt) {
  G.time += dt; G.frame++;
  hashClear(G.hash);
  for (const a of G.actors) if (a.alive) hashAdd(G.hash, a);
  // soldiers (humans + bots)
  for (const a of G.actors) {
    if (a.kind !== "soldier") continue;
    let inp = null;
    if (a.human) inp = a.remote ? a.netInp || {} : inputs[a.pidx] || {};
    else if (a.bot) inp = botThink(G, a, dt);
    stepSoldier(G, a, inp || {}, dt);
  }
  if (G.mode === "zombies") ZM.step(G, dt); else TD.step(G, dt);
  stepProjectiles(G, dt);
  stepDrops(G, dt);
  runSimTimers(G);
  // remove dead zombies after their death frame
  if (G.frame % 30 === 0) G.actors = G.actors.filter((a) => a.alive || a.kind !== "zombie");
}

function moveSpeed(G, a) {
  const d = curDef(a);
  let s = SOLDIER_SPEED * (d.mob || 1);
  if (hasPerk(a, "swift")) s *= 1.15;
  const t = tileOf(G.map, a.x, a.y);
  if (t >= 0 && G.map.floor[t] === F_CORN) s *= 0.78;
  if (a.down) s = 42;
  if (a.reloadT > 0) s *= 0.92;
  if (a.bot && a.bot.slow) s *= a.bot.slow;
  return s;
}

function stepSoldier(G, a, inp, dt) {
  if (!a.alive) {
    if (G.mode === "tdm") TD.deadTick(G, a, dt);
    return;
  }
  if (a.protectT > 0) a.protectT -= dt;
  a.fireCD -= dt; a.knifeCD -= dt; a.gCD -= dt; a.flash = Math.max(0, a.flash - dt);
  a.recoil = Math.max(0, a.recoil - dt * 6);
  if (a.knifeT > 0) a.knifeT -= dt;
  if (a.swapT > 0) a.swapT -= dt;
  // --- movement (remote guests move themselves; the host just takes their position)
  if (!a.remote) {
    let mx = inp.mx || 0, my = inp.my || 0;
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const sp = moveSpeed(G, a);
    const k = Math.min(1, dt * (a.down ? 6 : 13));
    a.vx += (mx * sp - a.vx) * k; a.vy += (my * sp - a.vy) * k;
    if (a.knifeT > 0.2 && a.lunge) { a.vx += a.lunge[0] * dt * 60; a.vy += a.lunge[1] * dt * 60; }
    moveCircle(G.map, G.map.solidP, a, a.vx * dt, a.vy * dt);
    if (G.leash) G.leash(G, a);
  } else if (a.netPos) {
    a.vx = (a.netPos[0] - a.x) / Math.max(dt, 0.001); a.vy = (a.netPos[1] - a.y) / Math.max(dt, 0.001);
    a.x = a.netPos[0]; a.y = a.netPos[1];
  }
  const spd = Math.hypot(a.vx, a.vy);
  a.walk += spd * dt * 0.06;
  if (spd > 20) a.moveAng = Math.atan2(a.vy, a.vx);
  // --- aim
  if (inp.aim !== undefined && inp.aim !== null) a.ang = a.bot ? inp.aim : turnTo(a.ang, inp.aim, dt * 30);
  else if (spd > 30 && !a.bot) a.ang = turnTo(a.ang, a.moveAng, dt * 10);
  // --- down (zombies "last stand"): crawl and fire the pistol, waiting for a revive
  if (a.down) { ZM.downTick(G, a, inp, dt); }
  // --- health regen
  const regenDelay = G.mode === "zombies" ? 3.0 : TDM.regenDelay;
  if (!a.down && G.time - a.hurtT > regenDelay && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + (G.mode === "zombies" ? 75 : TDM.regenRate) * dt);
  // --- weapon handling
  const slot = curSlot(a), d = wdef(slot);
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0) {
      const need = d.mag - slot.mag, take = Math.min(need, slot.res);
      slot.mag += take; slot.res -= take; a.reloadT = 0;
      ev(G, { k: "snd", s: "reloadEnd", x: a.x, y: a.y, v: a.human ? 1 : 0.5, o: a.id });
    }
  }
  if (!inp.fire || a.fireCD < -0.2) a.spreadAdd = Math.max(0, a.spreadAdd - dt * 0.25);
  a.firing = false;
  const busy = a.reloadT > 0 || a.swapT > 0 || a.knifeT > 0.15;
  if (inp.swap && a.weapons.length > 1 && !a.down) { a.cur = 1 - a.cur; a.swapT = 0.38; a.reloadT = 0; ev(G, { k: "snd", s: "swap", x: a.x, y: a.y, v: 0.6, o: a.id }); }
  else if (inp.reload && !busy && slot.mag < d.mag && slot.res > 0) startReload(G, a);
  else if (inp.knife && a.knifeCD <= 0 && !a.down) knifeAttack(G, a);
  else if (inp.gren && a.frags > 0 && a.gCD <= 0 && !busy && !a.down) throwFrag(G, a, inp.grenDist);
  else if (inp.fire && !busy && a.fireCD <= 0) {
    if (slot.mag > 0) fireWeapon(G, a);
    else if (slot.res > 0) startReload(G, a);
    else {
      a.fireCD = 0.3; ev(G, { k: "snd", s: "dry", x: a.x, y: a.y, v: 0.6, o: a.id });
      const other = a.weapons[1 - a.cur];
      if (other && (other.mag > 0 || other.res > 0) && !a.down) { a.cur = 1 - a.cur; a.swapT = 0.38; }
    }
  }
  // auto reload when empty and not firing
  if (!inp.fire && slot.mag === 0 && slot.res > 0 && a.reloadT <= 0 && a.swapT <= 0) startReload(G, a);
  // --- interactions (humans only)
  if (a.human || (a.bot && a.bot.zombieBot)) handleUse(G, a, inp, dt);
  // knife lunge that connects a moment later
  if (a.pendingStab) {
    a.pendingStab.t -= dt;
    if (a.pendingStab.t <= 0) {
      const b = a.pendingStab.b; a.pendingStab = null;
      if (b.alive && dist(a.x, a.y, b.x, b.y) - b.r <= KNIFE.range + 14) {
        damage(G, b, b.kind === "zombie" ? KNIFE.zdmg : KNIFE.dmg, a, "knife", false, "knife", a.ang);
        ev(G, { k: "impact", x: b.x, y: b.y, a: a.ang, m: b.kind === "zombie" ? "zombie" : "flesh", o: a.id });
        ev(G, { k: "snd", s: "stab", x: b.x, y: b.y, v: 1, o: a.id });
      }
    }
  }
}

function startReload(G, a) {
  const d = curDef(a);
  let t = d.reload;
  if (hasPerk(a, "quick")) t *= 0.5;
  if (a.bot && G.mode === "tdm") t *= 1.1;
  a.reloadT = a.reloadDur = t;
  ev(G, { k: "snd", s: "reload", x: a.x, y: a.y, v: a.human ? 1 : 0.5, o: a.id, cls: d.cls });
}

/* ---------------- firing ---------------- */
function muzzle(G, a) {
  const L = a.r + 15, mx = a.x + Math.cos(a.ang) * L + Math.cos(a.ang + 1.57) * 4, my = a.y + Math.sin(a.ang) * L + Math.sin(a.ang + 1.57) * 4;
  // muzzle poking through a wall: fire from the body instead
  if (!los(G.map, a.x, a.y, mx, my, G.map.shot)) return [a.x, a.y];
  return [mx, my];
}

function fireWeapon(G, a) {
  const slot = curSlot(a), d = wdef(slot);
  let cd = 60 / d.rpm;
  if (hasPerk(a, "rapid")) cd *= 0.75;
  a.fireCD = cd;
  slot.mag--;
  a.firing = true; a.lastShot = G.time; a.recoil = 1; a.flash = 0.05; a.stats.shots++;
  const [mx, my] = muzzle(G, a);
  const moving = Math.hypot(a.vx, a.vy) > 40;
  let spread = d.spread + a.spreadAdd + (moving && d.moveSpread ? d.moveSpread : 0);
  if (a.down) spread += 0.04;
  a.spreadAdd = Math.min(0.11, a.spreadAdd + (d.kick || 0));
  const col = d.col || (d.cls === "volt" ? "#7ad7ff" : null);
  ev(G, { k: "flash", x: mx, y: my, a: a.ang, s: d.cls === "lmg" || d.cls === "shotgun" || d.cls === "sniper" ? 1.3 : d.cls === "pistol" ? 0.8 : 1, c: col, o: a.id });
  ev(G, { k: "snd", s: "gun", g: d.cls, x: a.x, y: a.y, v: 1, o: a.id, up: !!slot.up });
  if (d.cls !== "volt" && d.cls !== "launcher") ev(G, { k: "shell", x: a.x + Math.cos(a.ang) * 6, y: a.y + Math.sin(a.ang) * 6, a: a.ang, sg: d.cls === "shotgun" });
  if (d.explosive) {
    const ang = a.ang + rnd(-spread, spread);
    G.projs.push({ kind: "gl", x: mx, y: my, vx: Math.cos(ang) * d.explosive.speed, vy: Math.sin(ang) * d.explosive.speed, t: 2.2, owner: a, armD: 70, trav: 0,
      r: d.explosive.r, dmg: d.dmg, zdmg: d.zdmg || d.explosive.zdmg, wid: slot.id });
    return;
  }
  if (d.cls === "volt") { voltArc(G, a, mx, my, d); return; }
  const n = d.pellets || 1;
  for (let p = 0; p < n; p++) hitscan(G, a, mx, my, a.ang + (Math.random() * 2 - 1) * spread * (n > 1 ? 1 : Math.random() * 0.6 + 0.4), d, slot, p === 0);
}

function hitscan(G, a, mx, my, ang, d, slot, first) {
  const m = G.map, ux = Math.cos(ang), uy = Math.sin(ang);
  const maxD = Math.min(1700, d.range * (d.falloff >= 1 ? 1.2 : 2.4));
  const fromShooter = Math.hypot(mx - a.x, my - a.y);
  const wall = rayGrid(m, mx, my, ux, uy, maxD, m.shot, (i, dd) => dd + fromShooter > TILE * 1.25 && Math.random() < 0.5);
  let endD = wall.d;
  // actors along the ray
  const hits = [];
  for (const b of G.actors) {
    if (!targetable(G, a, b)) continue;
    const t = segCircle(mx, my, mx + ux * endD, my + uy * endD, b.x, b.y, b.r + (b.kind === "zombie" ? 3 : 1));
    if (t >= 0) hits.push([t * endD, b]);
  }
  hits.sort((p, q) => p[0] - q[0]);
  let pierce = d.pierce || 1, mul = 1, stopped = false;
  for (const [hd, b] of hits) {
    const dd = hd + fromShooter;
    let fall = dd <= d.range ? 1 : Math.max(d.falloff, 1 - (1 - d.falloff) * ((dd - d.range) / d.range));
    const crit = Math.random() < (d.crit || 0) * (b.kind === "zombie" && b.ztype === "brute" ? 0.5 : 1);
    const base = b.kind === "zombie" ? d.zdmg : d.dmg;
    let amt = base * fall * mul * (crit ? 2 : 1);
    if (slot.up && d.boom && b.kind === "zombie") { explode(G, mx + ux * hd, my + uy * hd, d.boom, 0, d.zdmg * 0.6, a, "pistolboom"); }
    damage(G, b, amt, a, "bullet", crit, slot.id, ang);
    a.stats.hits++;
    ev(G, { k: "impact", x: mx + ux * hd, y: my + uy * hd, a: ang, m: b.kind === "zombie" ? "zombie" : "flesh", crit, o: a.id });
    if (a.human) ev(G, { k: "hitmark", pid: a.id, kill: !b.alive });
    mul *= 0.75;
    if (--pierce <= 0) { endD = hd; stopped = true; break; }
  }
  // tracer (not every pellet, to keep the screen readable)
  if (first || Math.random() < 0.45) ev(G, { k: "tracer", x0: mx, y0: my, x1: mx + ux * endD, y1: my + uy * endD, c: d.col || null, w: d.cls === "sniper" || d.cls === "dmr" ? 2 : 1.3, o: a.id });
  if (!stopped && wall.i >= 0) {
    const ix = mx + ux * endD, iy = my + uy * endD;
    const t = m.tile[wall.i];
    if (t === T_BARREL) hitBarrel(G, m.barrelAt[wall.i], d.dmg, a);
    const mat = t === T_HIGH ? (m.ch[wall.i] === "v" ? "metal" : "wood") : t === T_TREE ? "wood" : t === T_LOW ? "sand" : t === T_BARREL ? "metal" : t === T_DOOR ? "metal" : "wall";
    ev(G, { k: "impact", x: ix, y: iy, a: ang, m: mat, nx: wall.nx, ny: wall.ny, o: a.id });
  } else if (!stopped && Math.random() < 0.25) {
    ev(G, { k: "impact", x: mx + ux * endD, y: my + uy * endD, a: ang, m: "ground" });
  }
}

/* Volt Caster: an arc that jumps from zombie to zombie */
function voltArc(G, a, mx, my, d) {
  const pts = [[mx, my]];
  let from = { x: mx, y: my }, hit = new Set();
  const cand = G.actors.filter((b) => targetable(G, a, b));
  let first = null, best = 1e9;
  for (const b of cand) {
    const dd = dist(mx, my, b.x, b.y); if (dd > d.range) continue;
    const da = Math.abs(angDiff(a.ang, angTo(mx, my, b.x, b.y)));
    if (da > 0.32) continue;
    if (!los(G.map, mx, my, b.x, b.y, G.map.shot)) continue;
    const score = dd + da * 600; if (score < best) { best = score; first = b; }
  }
  let cur = first;
  for (let n = 0; n < (d.chains || 5) && cur; n++) {
    hit.add(cur); pts.push([cur.x, cur.y]);
    damage(G, cur, d.zdmg, a, "volt", false, "volt", angTo(from.x, from.y, cur.x, cur.y));
    from = cur;
    let nb = null, nd = 190;
    for (const b of cand) { if (hit.has(b) || !b.alive) continue; const dd = dist(cur.x, cur.y, b.x, b.y); if (dd < nd && los(G.map, cur.x, cur.y, b.x, b.y, G.map.shot)) { nd = dd; nb = b; } }
    cur = nb;
  }
  if (!first) pts.push([mx + Math.cos(a.ang) * 300, my + Math.sin(a.ang) * 300]);
  ev(G, { k: "arc", pts, o: a.id });
}

/* ---------------- melee ---------------- */
function knifeAttack(G, a) {
  a.knifeCD = KNIFE.cd; a.knifeT = 0.35;
  ev(G, { k: "snd", s: "knife", x: a.x, y: a.y, v: 1, o: a.id });
  let best = null, bd = 1e9;
  for (const b of G.actors) {
    if (!targetable(G, a, b)) continue;
    const dd = dist(a.x, a.y, b.x, b.y) - b.r;
    if (dd > KNIFE.range + KNIFE.lunge) continue;
    const da = Math.abs(angDiff(a.ang, angTo(a.x, a.y, b.x, b.y)));
    if (da > KNIFE.arc && dd > 10) continue;
    if (dd < bd) { bd = dd; best = b; }
  }
  a.lunge = null;
  if (best) {
    a.ang = angTo(a.x, a.y, best.x, best.y);
    if (bd > KNIFE.range) { a.lunge = [Math.cos(a.ang) * 9, Math.sin(a.ang) * 9]; }
    if (bd <= KNIFE.range + 10) {
      damage(G, best, best.kind === "zombie" ? KNIFE.zdmg : KNIFE.dmg, a, "knife", false, "knife", a.ang);
      ev(G, { k: "impact", x: best.x, y: best.y, a: a.ang, m: best.kind === "zombie" ? "zombie" : "flesh" });
      ev(G, { k: "snd", s: "stab", x: best.x, y: best.y, v: 1 });
      if (best.kind === "zombie" && best.alive && !(G.net && G.net.role === "guest")) { best.vx += Math.cos(a.ang) * 220; best.vy += Math.sin(a.ang) * 220; best.stun = 0.25; }
    } else a.pendingStab = { t: 0.12, b: best };
  }
}

/* ---------------- grenades & projectiles ---------------- */
function throwFrag(G, a, want) {
  a.frags--; a.gCD = 0.9;
  if (G.net && G.net.role === "guest") { ev(G, { k: "snd", s: "throw", x: a.x, y: a.y, v: 1 }); return; }   // the host throws it
  const dd = clamp(want || 280, 90, 460);
  // with friction k the throw travels v/k: pick v for the wanted distance
  const k = 2.6, v = dd * k;
  const [mx, my] = muzzle(G, a);
  G.projs.push({ kind: "frag", x: mx, y: my, vx: Math.cos(a.ang) * v, vy: Math.sin(a.ang) * v, t: FRAG.fuse, owner: a, fr: k, h: 0, vh: 160 });
  ev(G, { k: "snd", s: "throw", x: a.x, y: a.y, v: 1, o: a.id });
}

function stepProjectiles(G, dt) {
  const m = G.map;
  for (const p of G.projs) {
    p.t -= dt;
    if (p.kind === "shell") { if (p.t <= 0) { explode(G, p.x, p.y, p.r, p.dmg, p.zdmg, p.owner, "air"); p.dead = true; } continue; }
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (p.kind === "gl") {
      p.trav += Math.hypot(p.vx, p.vy) * dt;
      let boom = false;
      if (isSolidAt(m, m.shot, nx, ny)) boom = true;
      for (const b of G.actors) if (!boom && targetable(G, p.owner, b) && dist2(nx, ny, b.x, b.y) < (b.r + 6) * (b.r + 6)) boom = true;
      if (boom && p.trav >= p.armD) { explode(G, p.x, p.y, p.r, p.dmg, p.zdmg, p.owner, "gl"); p.dead = true; continue; }
      if (boom) { p.vx *= -0.3; p.vy *= -0.3; p.kind = "frag"; p.t = Math.min(p.t, 0.9); p.fr = 3; p.r = p.r; continue; }
      p.x = nx; p.y = ny;
      if (p.t <= 0) { explode(G, p.x, p.y, p.r, p.dmg, p.zdmg, p.owner, "gl"); p.dead = true; }
      continue;
    }
    // frag: bounce off anything bullets can't pass
    if (isSolidAt(m, m.shot, nx, p.y)) { p.vx *= -0.45; ev(G, { k: "snd", s: "clink", x: p.x, y: p.y, v: 0.5 }); } else p.x = nx;
    if (isSolidAt(m, m.shot, p.x, ny)) { p.vy *= -0.45; ev(G, { k: "snd", s: "clink", x: p.x, y: p.y, v: 0.5 }); } else p.y = ny;
    const f = Math.max(0, 1 - p.fr * dt); p.vx *= f; p.vy *= f;
    p.vh -= 520 * dt; p.h = Math.max(0, p.h + p.vh * dt); if (p.h === 0 && p.vh < 0) p.vh = -p.vh * 0.35;
    if (p.t <= 0) { explode(G, p.x, p.y, p.r || FRAG.r, p.dmg || FRAG.dmg, p.zdmg || FRAG.zdmg, p.owner, "frag"); p.dead = true; }
  }
  G.projs = G.projs.filter((p) => !p.dead);
}

/* Explosion: damages everything in range that isn't behind a wall. kind "zboom" = an exploding zombie (hurts players). */
function explode(G, x, y, r, dmg, zdmg, owner, kind) {
  const m = G.map;
  ev(G, { k: "boom", x, y, r, kind });
  for (const b of G.actors) {
    if (!b.alive) continue;
    const dd = dist(x, y, b.x, b.y) - b.r * 0.5;
    if (dd > r) continue;
    if (!los(m, x, y, b.x, b.y, m.shot)) continue;
    const f = Math.pow(1 - clamp(dd / r, 0, 1), 0.7);
    if (b.kind === "zombie") {
      if (kind === "zboom" || !owner || owner.kind === "soldier") {
        damage(G, b, zdmg * f, owner && owner.kind === "soldier" ? owner : null, "boom", false, kind, angTo(x, y, b.x, b.y));
        if (b.alive) { b.vx += (b.x - x) * 4; b.vy += (b.y - y) * 4; }
      }
    } else {
      if (b.down || b.protectT > 0) continue;
      if (G.mode === "zombies") {
        if (kind === "zboom") damage(G, b, dmg * f, null, "boom", false, kind);
        continue;                          // no self / friendly explosive damage in zombies
      }
      if (owner && owner.kind === "soldier" && owner !== b && owner.team === b.team) continue;    // no friendly fire
      damage(G, b, (owner === b ? 0.5 : 1) * dmg * f, owner, "boom", false, kind, angTo(x, y, b.x, b.y));
    }
  }
  // chain barrels
  for (let k = 0; k < m.barrels.length; k++) {
    const br = m.barrels[k];
    if (br.alive && dist(x, y, br.wx, br.wy) < r * 0.9) hitBarrel(G, k, 999, owner);
  }
}

function hitBarrel(G, k, amt, by) {
  const b = G.map.barrels[k];
  if (!b || !b.alive) return;
  b.hp -= amt;
  if (b.hp > 0) { ev(G, { k: "impact", x: b.wx, y: b.wy, a: 0, m: "metal" }); return; }
  b.alive = false;
  refreshTile(G.map, b.i);
  ev(G, { k: "barrel", i: k });
  // a short delay feels better and lets chains ripple
  G.projs.push({ kind: "shell", x: b.wx, y: b.wy, t: 0.12, r: 135, dmg: 140, zdmg: 1600, owner: by && by.kind === "soldier" ? by : null });
}

/* ---------------- damage ---------------- */
function damage(G, v, amt, src, how, crit, wid, ang) {
  if (!v.alive || amt <= 0) return;
  if (G.net && G.net.role === "guest") return;     // the host decides all damage
  if (v.kind === "zombie") { ZM.damageZombie(G, v, amt, src, how, crit, wid, ang); return; }
  if (v.down || v.protectT > 0) return;
  if (G.godMode && v.kind === "soldier") return;
  v.hp -= amt; v.hurtT = G.time;
  ev(G, { k: "hurt", id: v.id, amt, x: v.x, y: v.y, a: ang === undefined ? (src ? angTo(src.x, src.y, v.x, v.y) : 0) : ang, from: src ? [src.x, src.y] : null });
  if (src && src.kind === "soldier") src.lastHit = G.time;
  if (v.hp <= 0) {
    v.hp = 0;
    if (G.mode === "zombies") ZM.playerDown(G, v);
    else TD.kill(G, v, src, how, wid, crit);
  }
}

/* ---------------- weapon drops on the ground ---------------- */
function dropWeapon(G, x, y, slot, life = 25) {
  if (!slot || slot.id === "p9" && !slot.up && G.mode === "tdm") return;
  const d = { id: G.nextId++, wid: slot.id, up: slot.up, mag: slot.mag, res: slot.res, x: x + rnd(-6, 6), y: y + rnd(-6, 6), t: life, a: rnd(TAU) };
  G.drops.push(d);
  ev(G, { k: "drop", id: d.id });
  return d;
}
function stepDrops(G, dt) {
  for (const d of G.drops) {
    d.t -= dt;
    // walking over a gun you already carry takes its ammo
    for (const a of G.actors) {
      if (a.kind !== "soldier" || !a.alive || a.down || d.t <= 0) continue;
      if (dist2(a.x, a.y, d.x, d.y) > 26 * 26) continue;
      const s = a.weapons.find((w) => w.id === d.wid);
      if (s) {
        const def = wdef(s), max = def.res;
        const take = Math.min(max - s.res, d.mag + d.res);
        if (take > 0) { s.res += take; d.t = 0; if (a.human) ev(G, { k: "toast", pid: a.id, t: "+" + take + " AMMO" }); ev(G, { k: "snd", s: "ammo", x: d.x, y: d.y, v: 0.7, o: a.id }); }
      }
    }
  }
  G.drops = G.drops.filter((d) => d.t > 0);
}
function takeDrop(G, a, d) {
  if (d.t <= 0) return;
  const slot = { id: d.wid, up: d.up, mag: d.mag, res: d.res };
  if (a.weapons.length < 2) { a.weapons.push(slot); a.cur = a.weapons.length - 1; }
  else { const old = a.weapons[a.cur]; a.weapons[a.cur] = slot; dropWeapon(G, a.x, a.y, old, 20); }
  d.t = 0; a.swapT = 0.35; a.reloadT = 0;
  ev(G, { k: "snd", s: "pickup", x: a.x, y: a.y, v: 1, o: a.id });
}

/* ---------------- USE button: the best thing to interact with nearby ---------------- */
function handleUse(G, a, inp, dt) {
  if (!a.alive || a.down) { a.prompt = null; return; }
  const p = G.mode === "zombies" ? ZM.prompt(G, a) : null;
  let best = p;
  if (!best) {
    let bd = 40;
    for (const d of G.drops) {
      const dd = dist(a.x, a.y, d.x, d.y);
      if (dd < bd && !a.weapons.some((w) => w.id === d.wid)) { bd = dd; best = { key: "drop" + d.id, label: "SWAP FOR " + wdef({ id: d.wid, up: d.up }).name.toUpperCase(), can: true, act: () => takeDrop(G, a, d) }; }
    }
  }
  a.prompt = best;
  if (!best) { a.holdT = 0; return; }
  if (G.net && G.net.role === "guest") { if (best.hold && inp.useHold && best.can) { if (a.holdKey !== best.key) { a.holdKey = best.key; a.holdT = 0; } a.holdT = Math.min(best.hold, a.holdT + dt); } else a.holdT = 0; return; }
  if (best.hold) {
    if (inp.useHold && best.can) {
      if (a.holdKey !== best.key) { a.holdKey = best.key; a.holdT = 0; }
      a.holdT += dt;
      best.tick && best.tick(dt);
      if (a.holdT >= best.hold) { a.holdT = 0; best.act(); }
    } else { a.holdT = 0; a.holdKey = null; }
  } else if (inp.use) {
    if (best.can) best.act();
    else { ev(G, { k: "snd", s: "deny", x: a.x, y: a.y, v: 0.8, o: a.id }); ev(G, { k: "toast", pid: a.id, t: best.why || "NOT ENOUGH POINTS" }); }
  }
}

/* ---------------- aim helpers ---------------- */
// aim assist for thumbs: nudge the aim toward the best enemy inside a small cone
function aimAssist(G, a, ang, cone = 0.2, range = 650) {
  let best = null, bs = 1e9;
  for (const b of G.actors) {
    if (!targetable(G, a, b)) continue;
    const dd = dist(a.x, a.y, b.x, b.y); if (dd > range) continue;
    const ta = angTo(a.x, a.y, b.x, b.y), da = Math.abs(angDiff(ang, ta));
    const allow = cone + Math.atan2(b.r, dd);
    if (da > allow) continue;
    if (!los(G.map, a.x, a.y, b.x, b.y, G.map.shot)) continue;
    const s = da * 400 + dd * 0.4; if (s < bs) { bs = s; best = ta; }
  }
  if (best === null) return ang;
  return ang + angDiff(ang, best) * 0.7;
}
// auto-aim for keyboard players sharing one keyboard: nearest visible enemy in front
function autoAim(G, a, facing, range = 620, cone = 1.2) {
  let best = null, bs = 1e9;
  for (const b of G.actors) {
    if (!targetable(G, a, b)) continue;
    const dd = dist(a.x, a.y, b.x, b.y); if (dd > range) continue;
    const ta = angTo(a.x, a.y, b.x, b.y), da = Math.abs(angDiff(facing, ta));
    if (da > cone) continue;
    if (!los(G.map, a.x, a.y, b.x, b.y, G.map.shot)) continue;
    const s = dd + da * 200; if (s < bs) { bs = s; best = ta; }
  }
  return best;
}
