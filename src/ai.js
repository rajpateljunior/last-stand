/* Bots. Soldier bots for Team Deathmatch (see, react, aim, burst, strafe, flank, grenade), and a zombies-mode bot
   (used for the title-screen demo and for the balance simulation): kites zombies, shoots, rebuilds windows, shops. */

function botThink(G, a, dt) {
  if (a.bot.zombieBot) return zbotThink(G, a, dt);
  return sbotThink(G, a, dt);
}

/* can bot `a` see `b` (walls block; corn hides anything more than ~2.5 m inside it) */
function canSee(G, a, b, maxD = 1150) {
  const d = dist(a.x, a.y, b.x, b.y);
  if (d > maxD) return false;
  const m = G.map, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
  let cornRun = 0;
  const r = rayGrid(m, a.x, a.y, ux, uy, d, m.sight, (i, dd) => { cornRun = cornRun || dd; return dd - cornRun > 95 && d - dd > 30; });
  return r.i === -1;
}

const _botTmp = [];
function sbotThink(G, a, dt) {
  const B = a.bot, D = B.diff, m = G.map;
  const inp = B.inp || (B.inp = {});
  inp.fire = false; inp.reload = false; inp.knife = false; inp.gren = false; inp.swap = false;
  B.t -= dt;
  B.reactT = (B.reactT || 0) - dt;
  B.burst = (B.burst || 0) - dt;
  B.strafeT = (B.strafeT || 0) - dt;
  B.goalT = (B.goalT || 0) - dt;
  const slot = curSlot(a), wd = wdef(slot);
  if (B.t <= 0) {
    B.t = 0.11 + rnd(0.04);
    // --- perception
    let tgt = null, ts = 1e9;
    for (const b of G.actors) {
      if (b.kind !== "soldier" || !b.alive || b.team === a.team) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const da = Math.abs(angDiff(a.ang, angTo(a.x, a.y, b.x, b.y)));
      const heard = G.time - b.lastShot < 1.2 && d < 750;
      const radar = G.t && G.t.recon[a.team] > 0 && d < 900;
      if (!(da < 1.9 || d < 230 || heard || radar)) continue;
      if (!canSee(G, a, b)) continue;
      const s = d + da * 140 - (b === B.target ? 160 : 0);
      if (s < ts) { ts = s; tgt = b; }
    }
    if (tgt && tgt !== B.target) { B.reactT = D.react * rnd(0.8, 1.35) * (B.target ? 0.5 : 1); B.settle = 0; }
    B.target = tgt;
    if (tgt) { B.lastSeen = [tgt.x, tgt.y, G.time]; B.path = null; }
    // heard gunfire: remember where
    if (!tgt) {
      for (const b of G.actors) if (b.kind === "soldier" && b.alive && b.team !== a.team && G.time - b.lastShot < 0.6 && dist(a.x, a.y, b.x, b.y) < 950) { B.heard = [b.x, b.y, G.time]; break; }
    }
    // weapon choice: snipers / launchers switch to the pistol up close
    if (tgt) {
      const d = dist(a.x, a.y, tgt.x, tgt.y);
      if (a.cur === 0 && ["sniper", "launcher"].includes(wd.cls) && d < 150 && a.weapons[1] && a.swapT <= 0) inp.swap = true;
      else if (a.cur === 1 && d > 320 && a.weapons[0] && (a.weapons[0].mag + a.weapons[0].res) > 0 && a.swapT <= 0) inp.swap = true;
    } else if (a.cur === 1 && a.weapons[0] && (a.weapons[0].mag + a.weapons[0].res) > 0 && a.swapT <= 0 && Math.random() < 0.3) inp.swap = true;
    // grenade at someone who just ducked behind cover
    if (!tgt && B.lastSeen && G.time - B.lastSeen[2] < 2.5 && a.frags > 0 && a.gCD <= 0 && Math.random() < 0.14 * D.burst) {
      const d = dist(a.x, a.y, B.lastSeen[0], B.lastSeen[1]);
      if (d > 170 && d < 460) { B.throwAt = [B.lastSeen[0], B.lastSeen[1]]; }
    }
    // reload while nothing is happening
    if (!tgt && slot.mag < wd.mag * 0.5 && slot.res > 0) inp.reload = true;
    // --- navigation goal when nothing to shoot
    if (!tgt && (!B.goal || B.goalT <= 0 || dist(a.x, a.y, B.goal[0], B.goal[1]) < 50)) {
      if (B.lastSeen && G.time - B.lastSeen[2] < 6) B.goal = [B.lastSeen[0], B.lastSeen[1]];
      else if (B.heard && G.time - B.heard[2] < 5) B.goal = [B.heard[0], B.heard[1]];
      else B.goal = botRoamGoal(G, a);
      B.goalT = rnd(8, 14); B.path = null;
    }
  }
  const tgt = B.target && B.target.alive ? B.target : null;
  let mx = 0, my = 0;
  // --- grenade throw (turn first)
  if (B.throwAt) {
    const ta = angTo(a.x, a.y, B.throwAt[0], B.throwAt[1]);
    inp.aim = turnTo(a.ang, ta, D.track * dt * 1.4);
    if (Math.abs(angDiff(a.ang, ta)) < 0.12) { inp.gren = true; inp.grenDist = dist(a.x, a.y, B.throwAt[0], B.throwAt[1]); B.throwAt = null; }
  }
  if (tgt) {
    const d = dist(a.x, a.y, tgt.x, tgt.y);
    // aim with lead and a wobble that settles the longer the bot tracks you
    B.settle = Math.min(1, (B.settle || 0) + dt * 0.8);
    const lead = Math.min(0.25, d / 2200);
    const ta = angTo(a.x, a.y, tgt.x + tgt.vx * lead, tgt.y + tgt.vy * lead);
    const err = D.aimErr * (1.2 - B.settle * 0.6) * (Math.sin(G.time * 2.3 + a.id) * 0.7 + Math.sin(G.time * 5.1 + a.id * 3) * 0.3) * (1 + Math.hypot(tgt.vx, tgt.vy) / 300);
    if (!B.throwAt) inp.aim = turnTo(a.ang, ta + err, D.track * dt);
    const aligned = Math.abs(angDiff(a.ang, ta)) < 0.16 + wd.spread;
    if (B.reactT <= 0 && aligned) {
      if (d < 52 && Math.random() < 0.08) inp.knife = true;
      else if (wd.auto) {
        if (B.burst <= 0 && !B.firing) { B.firing = true; B.burst = rnd(0.25, 0.65) * (d > 500 ? 0.6 : 1); }
        else if (B.burst <= 0 && B.firing) { B.firing = false; B.burst = rnd(0.12, 0.38) / D.burst; }
        inp.fire = B.firing;
      } else inp.fire = Math.random() < 0.55 + D.burst * 0.4;
    }
    // movement: strafe, keep a good range for the gun, back off when hurt
    const pref = { smg: 230, shotgun: 120, sniper: 650, dmr: 480, lmg: 380, pistol: 260, magnum: 300, launcher: 420, ak: 360, rifle: 380 }[wd.cls] || 320;
    if (B.strafeT <= 0) { B.strafe = Math.random() < 0.5 ? -1 : 1; B.strafeT = rnd(0.5, 1.4); B.still = Math.random() < 0.18; }
    const ang = angTo(a.x, a.y, tgt.x, tgt.y);
    let fwd = d > pref * 1.25 ? 0.8 : d < pref * 0.6 ? -0.7 : 0;
    if (a.hp < 35) fwd = -0.6;
    const st = B.still ? 0 : B.strafe * 0.85;
    mx = Math.cos(ang) * fwd + Math.cos(ang + Math.PI / 2) * st;
    my = Math.sin(ang) * fwd + Math.sin(ang + Math.PI / 2) * st;
    // don't strafe into walls
    const px = a.x + mx * 30, py = a.y + my * 30;
    if (isSolidAt(m, m.solidP, px, py)) { B.strafe = -B.strafe; mx = -mx * 0.5; my = -my * 0.5; }
  } else {
    // follow a path to the goal
    if (B.goal) {
      if (!B.path || B.pathI >= B.path.length) { B.path = findPath(m, a.x, a.y, B.goal[0], B.goal[1]); B.pathI = 1; if (!B.path) B.goal = null; }
      if (B.path) {
        // skip ahead to the furthest waypoint we can walk to in a straight line
        for (let k = Math.min(B.path.length - 1, B.pathI + 5); k > B.pathI; k--) {
          const [wx, wy] = tileCenter(m, B.path[k]);
          if (walkLine(m, a.x, a.y, wx, wy, a.r - 2)) { B.pathI = k; break; }
        }
        const [wx, wy] = tileCenter(m, B.path[Math.min(B.pathI, B.path.length - 1)]);
        if (dist(a.x, a.y, wx, wy) < 18) B.pathI++;
        const ang = angTo(a.x, a.y, wx, wy);
        mx = Math.cos(ang); my = Math.sin(ang);
        if (!B.throwAt) inp.aim = turnTo(a.ang, B.lastSeen && G.time - B.lastSeen[2] < 3 ? angTo(a.x, a.y, B.lastSeen[0], B.lastSeen[1]) : ang, D.track * dt * 0.7);
      }
    }
    // stuck detection
    B.stk = (B.stk || 0) + dt;
    if (B.stk > 1.2) { if (B.stkPos && dist(a.x, a.y, B.stkPos[0], B.stkPos[1]) < 14) { B.path = null; B.goal = botRoamGoal(G, a); } B.stkPos = [a.x, a.y]; B.stk = 0; }
  }
  inp.mx = mx; inp.my = my;
  return inp;
}

// pick somewhere to go: the middle lanes or the enemy's half (bots on a human's team stay a bit closer to them)
function botRoamGoal(G, a) {
  const m = G.map;
  const mate = a.team === 0 && G.humans.find((h) => h.team === a.team && h.alive);
  for (let tries = 0; tries < 30; tries++) {
    let x, y;
    if (mate && Math.random() < 0.3) { x = mate.x + rnd(-260, 260); y = mate.y + rnd(-260, 260); }
    else {
      const enemySide = a.team === 0 ? 1 : 0, sp = m.spawns[enemySide][0], mine = m.spawns[a.team][0];
      const t = Math.random() < 0.6 ? rnd(0.35, 0.95) : rnd(0.1, 0.6);
      x = lerp(mine.wx, sp.wx, t) + rnd(-m.pw * 0.3, m.pw * 0.3) * (Math.abs(sp.wx - mine.wx) > Math.abs(sp.wy - mine.wy) ? 0.15 : 1);
      y = lerp(mine.wy, sp.wy, t) + rnd(-m.ph * 0.45, m.ph * 0.45) * (Math.abs(sp.wx - mine.wx) > Math.abs(sp.wy - mine.wy) ? 1 : 0.15);
    }
    const i = tileOf(m, x, y);
    if (i >= 0 && !m.solidP[i]) { const [cx, cy] = tileCenter(m, i); return [cx, cy]; }
  }
  return [m.pw / 2, m.ph / 2];
}

/* ---------------- zombies bot (title demo + balance simulation) ---------------- */
function zbotThink(G, a, dt) {
  const B = a.bot, m = G.map, Z = G.z;
  const inp = B.inp || (B.inp = {});
  inp.fire = false; inp.reload = false; inp.knife = false; inp.gren = false; inp.swap = false; inp.use = false; inp.useHold = false;
  const skill = B.skill || 0.8;
  B.t = (B.t || 0) - dt;
  // nearest zombies
  let near = null, nd = 1e9, threat = 0, rx = 0, ry = 0, vis = null, vd = 1e9;
  for (const z of G.actors) {
    if (z.kind !== "zombie" || !z.alive || z.rise > 0.5) continue;
    const d = dist(a.x, a.y, z.x, z.y);
    if (d < nd) { nd = d; near = z; }
    if (d < 320) { const w = 1 / Math.max(30, d); rx += (a.x - z.x) / d * w; ry += (a.y - z.y) / d * w; threat++; }
    if (d < 650 && d < vd && (B.t > 0 ? z === B.vis : los(m, a.x, a.y, z.x, z.y, m.shot))) { vd = d; vis = z; }
  }
  if (B.t <= 0) B.t = 0.15;
  B.vis = vis;
  let mx = 0, my = 0;
  if (vis) {
    const ta = angTo(a.x, a.y, vis.x + vis.vx * 0.1, vis.y + vis.vy * 0.1) + (1 - skill) * 0.12 * Math.sin(G.time * 3 + a.id);
    inp.aim = turnTo(a.ang, ta, dt * 9);
    if (Math.abs(angDiff(a.ang, ta)) < 0.12) inp.fire = true;
    if (nd < 46 && (Z.round <= 2 || curSlot(a).mag === 0)) inp.knife = true;
    if (threat >= 6 && a.frags > 0 && a.gCD <= 0 && nd > 120) { inp.gren = true; inp.grenDist = Math.min(300, nd); }
  } else if (curSlot(a).mag < wdef(curSlot(a)).mag && nd > 260) inp.reload = true;
  // kite: move away from the pack, preferring open ground and circling rather than backing into a corner
  if (threat > 0 && nd < 300) {
    const want = Math.atan2(ry, rx);
    let best = want, bs = -1e9;
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * TAU;
      const c = Math.cos(angDiff(ang, want));
      let s = c * 1.6 + (1 - Math.abs(c)) * 0.7;
      let free = 0;
      for (let st = 1; st <= 8; st++) { if (isSolidAt(m, m.solidP, a.x + Math.cos(ang) * st * 30, a.y + Math.sin(ang) * st * 30)) break; free++; }
      s += free * 0.45;
      // walls around where this direction leads
      const px = a.x + Math.cos(ang) * 90, py = a.y + Math.sin(ang) * 90;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isSolidAt(m, m.solidP, px + dx * 40, py + dy * 40)) s -= 0.35;
      // don't run into another zombie
      for (const z of G.actors) if (z.kind === "zombie" && z.alive && z.rise <= 0.5) { const dz = dist(a.x + Math.cos(ang) * 70, a.y + Math.sin(ang) * 70, z.x, z.y); if (dz < 70) s -= (70 - dz) / 15; }
      // stay roughly where the action is
      if (B.home) s -= dist(px, py, B.home[0], B.home[1]) / 500;
      if (s > bs) { bs = s; best = ang; }
    }
    mx = Math.cos(best); my = Math.sin(best);
  } else if (!B.noShop && (!vis || nd > 420)) {
    // calm moment: rebuild windows, shop, explore (still shooting anything in sight)
    const keepAim = inp.aim, keepFire = inp.fire;
    zbotChores(G, a, inp);
    if (vis) { inp.aim = keepAim; inp.fire = keepFire; }
    mx = inp.mx || 0; my = inp.my || 0;
  } else if (vis) {
    // hold ground and shoot, side-stepping a little
    const side = angTo(a.x, a.y, vis.x, vis.y) + Math.PI / 2 * (Math.sin(G.time * 0.7 + a.id) > 0 ? 1 : -1);
    if (!isSolidAt(m, m.solidP, a.x + Math.cos(side) * 30, a.y + Math.sin(side) * 30)) { mx = Math.cos(side) * 0.4; my = Math.sin(side) * 0.4; }
  }
  if (!B.home) { const st = G.map.start || { wx: a.x, wy: a.y }; B.home = [st.wx, st.wy]; }
  inp.mx = mx; inp.my = my;
  return inp;
}

function zbotChores(G, a, inp) {
  const B = a.bot, m = G.map, Z = G.z;
  inp.mx = 0; inp.my = 0;
  // current errand
  if (!B.errand || G.time > B.errandT) {
    B.errand = zbotPickErrand(G, a); B.errandT = G.time + 14; B.path = null;
  }
  const e = B.errand;
  if (!e) return;
  const d = dist(a.x, a.y, e.x, e.y);
  if (d < (e.r || 44)) {
    inp.aim = angTo(a.x, a.y, e.x, e.y);
    if (a.prompt && a.prompt.hold) inp.useHold = true;
    else if (a.prompt && a.prompt.can) { inp.use = true; B.errand = null; }
    else if (!a.prompt || !a.prompt.can) { if ((B.errWait = (B.errWait || 0) + 1) > 30) { B.errand = null; B.errWait = 0; } }
    if (a.prompt && a.prompt.hold && a.holdT === 0 && B.lastHold) B.errand = null;
    B.lastHold = a.prompt && a.prompt.hold;
    return;
  }
  if (!B.path || B.pathI >= B.path.length || B.pathFor !== e) { B.path = findPath(m, a.x, a.y, e.x, e.y); B.pathI = 1; B.pathFor = e; if (!B.path) { B.errand = null; return; } }
  for (let k = Math.min(B.path.length - 1, B.pathI + 4); k > B.pathI; k--) { const [wx, wy] = tileCenter(m, B.path[k]); if (walkLine(m, a.x, a.y, wx, wy, a.r - 2)) { B.pathI = k; break; } }
  const [wx, wy] = tileCenter(m, B.path[Math.min(B.pathI, B.path.length - 1)]);
  if (dist(a.x, a.y, wx, wy) < 16) B.pathI++;
  const ang = angTo(a.x, a.y, wx, wy);
  inp.mx = Math.cos(ang); inp.my = Math.sin(ang);
  inp.aim = ang;
}

// what should the zombies bot do next? (repair, buy a better gun, perks, power, doors)
function zbotPickErrand(G, a) {
  const m = G.map, Z = G.z, pts = a.points;
  const reach = (x, y) => { const s = nearestOpen(m, x, y); return Z.open.has(m.area[s]) || m.area[s] < 0; };
  const spot = (x, y) => { const t = nearestOpen(m, x, y); const [cx, cy] = tileCenter(m, t); return { x: cx, y: cy }; };
  // windows near home
  const dmg = m.windows.filter((w) => w.boards < WINDOW_BOARDS && w.sides.some((s) => Z.open.has(s)) && dist(a.x, a.y, w.wx, w.wy) < 520);
  const tier = { p9: 0, dmr: 1, sg12: 1, mx5: 2, r4: 3, k74: 3, hammer: 4 };
  const have = Math.max(...a.weapons.map((w) => (w.up ? 6 : tier[w.id] !== undefined ? tier[w.id] : 4)));
  const opts = [];
  if (Z.alive === 0 || Z.phase !== "live") for (const w of dmg) opts.push([3, Object.assign(spot(w.wx, w.wy), { r: 50 })]);
  for (const wb of m.wallbuys) if (Z.open.has(wb.area) && (tier[wb.gun] || 0) > have && pts >= WEAPONS[wb.gun].cost + 200) opts.push([6 + tier[wb.gun], { x: wb.wx, y: wb.wy, r: 40 }]);
  for (const p of m.perks) if ((Z.power || !PERKS[p.perk].power) && !p.gone && !hasPerk(a, p.perk) && a.perks.length < 4 && reach(p.wx, p.wy) && pts >= (p.perk === "wind" ? PERKS.wind.soloCost : PERKS[p.perk].cost) + 100) opts.push([p.perk === "iron" ? 12 : p.perk === "wind" ? 10 : 5, Object.assign(spot(p.wx, p.wy), { r: 52 })]);
  if (!Z.power && m.power && reach(m.power.wx, m.power.wy)) opts.push([11, Object.assign(spot(m.power.wx, m.power.wy), { r: 52 })]);
  if (Z.power && m.forge && reach(m.forge.wx, m.forge.wy) && pts >= FORGE_COST + 500 && !curSlot(a).up && WEAPONS[curSlot(a).id].up) opts.push([10, Object.assign(spot(m.forge.wx, m.forge.wy), { r: 52 })]);
  for (const d of m.doors) {
    if (d.open || !d.sides.some((s) => Z.open.has(s)) || pts < d.cost + 300) continue;
    // stand on the open side of the door
    let best = null;
    for (const [cx, cy] of d.cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = (cy + dy) * m.W + cx + dx; if (m.solidP[i] || !Z.open.has(m.area[i])) continue;
      const [wx, wy] = tileCenter(m, i); if (!best || dist(a.x, a.y, wx, wy) < dist(a.x, a.y, best.x, best.y)) best = { x: wx, y: wy, r: 30 };
    }
    // a door that leads to a better gun, the power or a perk is worth more
    const other = d.sides.find((s) => !Z.open.has(s));
    let val = 4 + (G.cfg.demo ? 3 : 0);
    if (m.power && m.power.area === other && !Z.power) val += 5;
    if (m.wallbuys.some((wb) => wb.area === other && (tier[wb.gun] || 0) > have)) val += 3;
    if (best) opts.push([val, best]);
  }
  if (!opts.length) return null;
  opts.sort((p, q) => q[0] - p[0]);
  return opts[0][1];
}
