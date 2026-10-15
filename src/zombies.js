/* ZOMBIES mode: endless rounds, windows, doors, wall guns, mystery box, perks, power, Forge, power-ups, last stand. */

const ZM = {};

ZM.init = function (G) {
  const m = G.map, cfg = G.cfg;
  // which areas touch each other through windows (zombies in a closed area next to an open one still spawn)
  m.winAdj = Array.from({ length: m.areaN }, () => new Set());
  for (const w of m.windows) for (const a of w.sides) for (const b of w.sides) if (a !== b) m.winAdj[a].add(b);
  const startSpot = m.boxSpots.findIndex((s) => s.area === m.startArea);
  G.z = {
    round: 0, phase: "pre", phaseT: cfg.demo ? 1 : 4, total: 0, spawned: 0, killed: 0, spawnT: 0, hound: false,
    open: new Set([m.startArea]), power: false, field: new Float32Array(m.N), fieldT: 0,
    box: { spot: startSpot >= 0 ? startSpot : 0, state: "idle", t: 0, wid: null, user: null, uses: 0, limit: rndi(6, 11) },
    timers: { double: 0, insta: 0, sale: 0 }, drops: { n: 0, last: -99 }, boardPts: {}, versus: cfg.variant === "versus",
    windSolo: 0, lastKill: null, totalKills: 0, best: 0,
  };
  // players
  const st = m.start || m.spawns[0][0];
  const offs = [[0, 0], [1, 0], [-1, 0], [0, 1]];
  (cfg.players || []).forEach((p, k) => {
    const t = nearestOpen(m, st.wx + offs[k][0] * TILE, st.wy + offs[k][1] * TILE);
    const [x, y] = tileCenter(m, t);
    const a = makeSoldier(G, { human: !p.bot, pidx: p.pidx, remote: p.remote, netId: p.netId, op: p.op, name: p.name, x, y, ang: -Math.PI / 2, hp: 150, weapons: [newSlot("p9")], frags: 2, team: 0,
      bot: p.bot ? { zombieBot: true, t: 0 } : null });
    a.points = POINTS.start;
  });
};

ZM.players = (G) => G.actors.filter((a) => a.kind === "soldier");
ZM.soloLike = (G) => ZM.players(G).length < 2 || G.z.versus;

/* ---------------- step ---------------- */
ZM.step = function (G, dt) {
  const Z = G.z, m = G.map;
  for (const k in Z.timers) if (Z.timers[k] > 0) { Z.timers[k] -= dt; if (Z.timers[k] <= 0) ev(G, { k: "pu_end", t: k }); }
  // rounds
  Z.phaseT -= dt;
  if (Z.phase === "pre" && Z.phaseT <= 0) ZM.startRound(G);
  if (Z.phase === "live") {
    const alive = G.actors.reduce((n, a) => n + (a.kind === "zombie" && a.alive ? 1 : 0), 0);
    Z.alive = alive;
    Z.spawnT -= dt;
    // hounds come in small packs; zombies keep trickling in
    const cap = Z.hound ? (ZM.players(G).length > 1 ? 5 : 3) : ZM.players(G).length > 1 ? 26 : ZCAP;
    if (Z.spawned < Z.total && alive < cap && Z.spawnT <= 0) {
      ZM.spawnOne(G);
      Z.spawnT = Z.hound ? rnd(1.1, 2.2) : clamp(2.1 - Z.round * 0.085, 0.4, 2.1) * rnd(0.7, 1.3);
    }
    if (Z.spawned >= Z.total && alive === 0) ZM.endRound(G);
  }
  if (Z.phase === "break" && Z.phaseT <= 0) { Z.phase = "pre"; Z.phaseT = 0.01; }
  // flow field toward every soldier who can be attacked
  Z.fieldT -= dt;
  if (Z.fieldT <= 0) {
    Z.fieldT = 0.3;
    const tg = G.actors.filter((a) => a.kind === "soldier" && a.alive && !a.down).map((a) => tileOf(m, a.x, a.y));
    if (tg.length) zombieField(m, tg, Z.field);
  }
  for (const a of G.actors) if (a.kind === "zombie" && a.alive) ZM.stepZombie(G, a, dt);
  // power-ups
  for (const p of G.powerups) {
    p.t -= dt;
    for (const a of G.actors) if (a.kind === "soldier" && a.alive && !a.down && p.t > 0 && dist2(a.x, a.y, p.x, p.y) < 34 * 34) { ZM.takePowerup(G, p, a); p.t = 0; }
  }
  G.powerups = G.powerups.filter((p) => p.t > 0);
  // mystery box timers
  const B = Z.box;
  if (B.state !== "idle") {
    B.t -= dt;
    if (B.state === "spin" && B.t <= 0) {
      if (B.uses >= B.limit && Math.random() < 0.55 && m.boxSpots.length > 1) {
        B.state = "skull"; B.t = 2.4; if (B.user) B.user.points += Z.timers.sale > 0 ? FIRESALE_BOX : BOX_COST;
        ev(G, { k: "snd", s: "skull", x: m.boxSpots[B.spot].wx, y: m.boxSpots[B.spot].wy, v: 1 });
        ev(G, { k: "toast", pid: B.user && B.user.id, t: "THE BOX IS MOVING · REFUNDED" });
      } else { B.state = "offer"; B.t = 9; B.wid = ZM.rollBox(G, B.user); ev(G, { k: "snd", s: "boxdone", x: m.boxSpots[B.spot].wx, y: m.boxSpots[B.spot].wy, v: 1 }); }
    } else if (B.state === "offer" && B.t <= 0) { B.state = "idle"; B.wid = null; B.user = null; }
    else if (B.state === "skull" && B.t <= 0) { B.state = "gone"; B.t = 3; }
    else if (B.state === "gone" && B.t <= 0) {
      let n = B.spot; while (n === B.spot) n = rndi(0, m.boxSpots.length - 1);
      B.spot = n; B.state = "idle"; B.uses = 0; B.limit = rndi(6, 11); B.user = null;
      ev(G, { k: "boxmove", spot: n });
    }
  }
  // game over: nobody left standing
  const ps = ZM.players(G);
  if (!G.over && ps.length && ps.every((a) => !a.alive || (a.down && !a.selfRev))) {
    G.overT = (G.overT || 0) + dt;
    if (G.overT > (ps.some((a) => a.alive) ? 0.4 : 1.5)) ZM.gameOver(G);
  } else if (!G.over) G.overT = 0;
};

ZM.startRound = function (G) {
  const Z = G.z;
  Z.round++;
  Z.hound = Z.round % HOUND_EVERY === 0 && Z.round >= HOUND_EVERY;
  const np = ZM.players(G).filter((a) => a.alive).length;
  Z.total = Z.hound ? Math.round(Math.min(24, 4 + Z.round * 0.9) * (np > 1 ? 1.5 : 1)) : zombieCount(Z.round, np);
  if (G.cfg.demo) Z.total = Math.min(Z.total, 14);
  Z.spawned = 0; Z.killed = 0; Z.spawnT = 1.2; Z.phase = "live"; Z.boardPts = {};
  // perma-perks? no. Every round you get one frag back (max 4)
  for (const a of ZM.players(G)) if (a.alive && Z.round > 1) a.frags = Math.min(FRAG.max, a.frags + 1);
  ev(G, { k: "round", n: Z.round, hound: Z.hound });
};

ZM.endRound = function (G) {
  const Z = G.z;
  Z.phase = "break"; Z.phaseT = Z.round === 1 ? 7 : 9;
  Z.best = Math.max(Z.best, Z.round);
  ev(G, { k: "roundEnd", n: Z.round });
  if (Z.hound && Z.lastKill) ZM.spawnPowerup(G, Z.lastKill[0], Z.lastKill[1], "ammo");
  Z.drops.n = 0;
  // revive anyone who bled out in co-op? no — but downed players get up at round end (classic rule)
  // anyone who bled out in co-op comes back next round (if a teammate is still standing)
  for (const a of ZM.players(G)) if (!a.alive && !G.z.versus && ZM.players(G).some((b) => b.alive && !b.down)) ZM.respawnPlayer(G, a);
};

ZM.respawnPlayer = function (G, a) {
  const alive = ZM.players(G).find((b) => b.alive && !b.down);
  const t = nearestOpen(G.map, alive.x + 30, alive.y);
  [a.x, a.y] = tileCenter(G.map, t);
  a.tp = (a.tp || 0) + 1;
  a.alive = true; a.down = false; a.hp = a.maxHp = 150; a.perks = []; a.weapons = [newSlot("p9")]; a.cur = 0; a.frags = 2; a.protectT = 2;
  ev(G, { k: "toast", t: a.name + " IS BACK" });
};

ZM.gameOver = function (G) {
  G.over = true; G.overT = 0;
  const ps = ZM.players(G);
  if (G.z.versus) G.winner = ps.reduce((b, a) => (a.points > b.points ? a : b), ps[0]);
  ev(G, { k: "gameover", round: G.z.round });
};

/* ---------------- spawning ---------------- */
ZM.spawnerActive = function (G, s) {
  const Z = G.z, m = G.map;
  if (s.area < 0) return false;
  if (Z.open.has(s.area)) return true;
  for (const b of m.winAdj[s.area]) if (Z.open.has(b)) return true;
  return false;
};

ZM.spawnOne = function (G) {
  const Z = G.z, m = G.map;
  const ps = ZM.players(G).filter((a) => a.alive && !a.down);
  if (!ps.length) return;
  let x, y, type;
  if (Z.hound) {
    // hounds appear out of a lightning strike somewhere around the players
    type = "hound";
    const p = pick(ps);
    for (let tries = 0; tries < 40; tries++) {
      const ang = rnd(TAU), d = rnd(330, 620);
      const t = tileOf(m, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d);
      if (t < 0 || m.solidP[t] || !Z.open.has(m.area[t])) continue;
      [x, y] = tileCenter(m, t); break;
    }
    if (x === undefined) { const s = ZM.pickSpawner(G, ps); if (!s) return; x = s.wx; y = s.wy; }
    ev(G, { k: "lightning", x, y });
  } else {
    const s = ZM.pickSpawner(G, ps);
    if (!s) return;
    x = s.wx + rnd(-8, 8); y = s.wy + rnd(-8, 8);
    type = ZM.rollType(G);
  }
  ZM.makeZombie(G, type, x, y);
  Z.spawned++;
};

ZM.pickSpawner = function (G, ps) {
  const m = G.map;
  const list = [];
  for (const s of m.spawners) {
    if (!ZM.spawnerActive(G, s)) continue;
    let dmin = 1e9, seen = false;
    for (const p of ps) { const d = dist(s.wx, s.wy, p.x, p.y); dmin = Math.min(dmin, d); if (d < 260 && los(m, s.wx, s.wy, p.x, p.y, m.sight)) seen = true; }
    if (seen) continue;
    // prefer spawners a little way off, never right on top of a player
    const w = dmin < 200 ? 0.05 : dmin < 1100 ? 1 : dmin < 1700 ? 0.35 : 0.08;
    list.push([s, w]);
  }
  if (!list.length) return m.spawners.find((s) => ZM.spawnerActive(G, s)) || null;
  let tot = list.reduce((t, l) => t + l[1], 0), r = Math.random() * tot;
  for (const [s, w] of list) { r -= w; if (r <= 0) return s; }
  return list[0][0];
};

ZM.rollType = function (G) {
  const r = G.z.round, x = Math.random();
  const brutes = G.actors.filter((a) => a.alive && a.ztype === "brute").length;
  if (r >= 8 && brutes < 1 + Math.floor((r - 8) / 6) && x < 0.035 + r * 0.002) return "brute";
  if (r >= 6 && x < 0.12) return "exploder";
  if (r >= 3 && x < 0.2) return "soldier";
  return "walker";
};

ZM.makeZombie = function (G, type, x, y) {
  const Z = G.z, T = ZTYPES[type], r = Z.round;
  let speed;
  if (type === "hound") speed = rnd(160, 176);
  else if (type === "brute") speed = rnd(62, 72);
  else if (type === "exploder") speed = rnd(52, 64);
  else {
    const run = Math.random() < clamp((r - 3) * 0.12, 0, 0.92), sprint = run && Math.random() < clamp((r - 9) * 0.08, 0, 0.7);
    speed = sprint ? rnd(136, 150) : run ? rnd(96, 118) : rnd(36, 56);
  }
  const hp = zombieHp(r) * T.hp * (G.cfg.demo ? 0.5 : 1);
  const a = { id: G.nextId++, kind: "zombie", ztype: type, x, y, vx: 0, vy: 0, r: T.r, ang: rnd(TAU), hp, maxHp: hp, alive: true, speed,
    rise: type === "hound" ? 0.35 : 1.1, atkT: 0, atkCD: 0, walk: rnd(10), look: Math.floor(rnd(1000)), stun: 0, stuckT: 0, prog: [x, y], tearT: 0, fuse: 0, chargeT: 0, chargeCD: 2, flinch: 0, groanT: rnd(2, 7) };
  G.actors.push(a);
  if (type !== "hound") ev(G, { k: "rise", x, y });
  return a;
};

/* ---------------- zombie brain ---------------- */
const _near = [];
ZM.stepZombie = function (G, z, dt) {
  const m = G.map, Z = G.z, T = ZTYPES[z.ztype];
  if (z.rise > 0) { z.rise -= dt; return; }
  z.walk += dt * (z.speed / 22);
  if (z.groanT -= dt, z.groanT <= 0) { z.groanT = rnd(3, 9); ev(G, { k: "snd", s: z.ztype === "hound" ? "growl" : "groan", x: z.x, y: z.y, v: 0.6, zt: z.ztype }); }
  // target = closest soldier who can be attacked
  let tgt = null, td = 1e9;
  for (const a of G.actors) if (a.kind === "soldier" && a.alive && !a.down) { const d = dist2(z.x, z.y, a.x, a.y); if (d < td) { td = d; tgt = a; } }
  td = Math.sqrt(td);
  if (z.stun > 0) { z.stun -= dt; z.vx *= 0.85; z.vy *= 0.85; moveCircle(m, m.solidZ, z, z.vx * dt, z.vy * dt); return; }
  if (z.flinch > 0) z.flinch -= dt;
  if (z.atkCD > 0) z.atkCD -= dt;
  if (z.chargeCD > 0) z.chargeCD -= dt;
  // exploder fuse
  if (z.fuse > 0) { z.fuse -= dt; if (z.fuse <= 0) { ZM.zombieBoom(G, z); return; } }
  let dx = 0, dy = 0, sp = z.speed * (z.flinch > 0 ? 0.55 : 1);
  if (!tgt) { z.vx *= 0.9; z.vy *= 0.9; return; }
  const ti = tileOf(m, z.x, z.y);
  // brute charge
  if (z.chargeT > 0) {
    z.chargeT -= dt;
    dx = Math.cos(z.ang); dy = Math.sin(z.ang); sp = T.charge;
    if (td < z.r + tgt.r + 6 && !z.chargeHit) { z.chargeHit = true; damage(G, tgt, 70, z, "zombie"); tgt.vx += dx * 520; tgt.vy += dy * 520; ev(G, { k: "snd", s: "slam", x: z.x, y: z.y, v: 1 }); z.chargeT = 0; }
  } else {
    let direct = td < 150 && los(m, z.x, z.y, tgt.x, tgt.y, m.solidZ);
    if (direct) { dx = tgt.x - z.x; dy = tgt.y - z.y; }
    else if (ti >= 0) {
      // follow the flow field: step to the cheapest neighbouring tile
      const W = m.W, x = ti % W, y = (ti / W) | 0;
      let best = -1, bd = Z.field[ti];
      for (const [ddx, ddy] of DIRS8) {
        const nx = x + ddx, ny = y + ddy; if (nx < 0 || ny < 0 || nx >= W || ny >= m.H) continue;
        const j = ny * W + nx;
        if (ddx && ddy && (m.solidZ[y * W + nx] || m.solidZ[ny * W + x] || m.tile[y * W + nx] === T_WINDOW || m.tile[ny * W + x] === T_WINDOW)) continue;
        if (Z.field[j] < bd) { bd = Z.field[j]; best = j; }
      }
      if (best >= 0) {
        // boarded window in the way: stand at it and tear the boards off
        if (m.tile[best] === T_WINDOW && m.windows[m.winAt[best]].boards > 0) {
          const w = m.windows[m.winAt[best]];
          const [cx, cy] = tileCenter(m, best);
          const ox = w.ori === 0 ? 0 : sign(z.x - cx) * (TILE * 0.5 + z.r + 1), oy = w.ori === 0 ? sign(z.y - cy) * (TILE * 0.5 + z.r + 1) : 0;
          dx = cx + ox - z.x; dy = cy + oy - z.y;
          if (Math.hypot(dx, dy) < 10) { dx = dy = 0; z.ang = angTo(z.x, z.y, cx, cy); }
          z.tearT += dt;
          if (z.tearT > (z.ztype === "brute" ? 0.5 : 1.15) && Math.hypot(z.x - cx, z.y - cy) < TILE + z.r + 8) {
            z.tearT = 0; w.boards--; refreshTile(m, w.i);
            ev(G, { k: "board", w: m.winAt[best], n: w.boards, x: cx, y: cy });
          }
        } else {
          z.tearT = 0;
          const [cx, cy] = tileCenter(m, best);
          dx = cx - z.x; dy = cy - z.y;
          // climbing through an open window is slow
          if (m.tile[ti] === T_WINDOW) sp *= 0.45;
        }
      }
    }
    // brute: start a charge when it has a clear run at you
    if (z.ztype === "brute" && z.chargeCD <= 0 && td < 240 && td > 70 && los(m, z.x, z.y, tgt.x, tgt.y, m.solidZ)) {
      z.chargeT = 0.75; z.chargeHit = false; z.chargeCD = rnd(4, 6); z.ang = angTo(z.x, z.y, tgt.x, tgt.y);
      ev(G, { k: "snd", s: "roar", x: z.x, y: z.y, v: 1 });
    }
  }
  // attack
  if (z.atkT > 0) {
    z.atkT -= dt; sp *= 0.3;
    if (z.atkT <= 0) {
      if (tgt && td - tgt.r < T.reach * 1.35) {
        damage(G, tgt, T.dmg, z, "zombie");
        ev(G, { k: "swipe", x: z.x, y: z.y, a: z.ang, id: z.id });
      }
      z.atkCD = T.cd;
    }
  } else if (tgt && td - tgt.r < T.reach && z.atkCD <= 0 && z.chargeT <= 0) {
    if (z.ztype === "exploder") { if (z.fuse <= 0) { z.fuse = 0.6; ev(G, { k: "snd", s: "hiss", x: z.x, y: z.y, v: 1 }); } }
    else { z.atkT = T.windup; z.ang = angTo(z.x, z.y, tgt.x, tgt.y); ev(G, { k: "snd", s: z.ztype === "hound" ? "bark" : "snarl", x: z.x, y: z.y, v: 0.8 }); }
  }
  const dl = Math.hypot(dx, dy);
  let wx = 0, wy = 0;
  if (dl > 0.01) { wx = (dx / dl) * sp; wy = (dy / dl) * sp; if (z.chargeT <= 0 && z.atkT <= 0) z.ang = turnTo(z.ang, Math.atan2(dy, dx), dt * 7); }
  // keep apart from other zombies; push into players a little (they can body-block you)
  hashQuery(G.hash, z.x, z.y, 40, _near);
  for (const o of _near) {
    if (o === z || !o.alive) continue;
    const ox = z.x - o.x, oy = z.y - o.y, d2 = ox * ox + oy * oy, rr = z.r + o.r;
    if (d2 > rr * rr || d2 < 0.01) continue;
    const d = Math.sqrt(d2), push = (rr - d) / d;
    if (o.kind === "zombie") { wx += ox * push * 9; wy += oy * push * 9; }
    else if (!o.down) { z.x += ox * push * 0.6; z.y += oy * push * 0.6; if (!o.remote) { o.x -= ox * push * 0.12; o.y -= oy * push * 0.12; resolveCircle(m, m.solidP, o); } }
  }
  const k = Math.min(1, dt * 8);
  z.vx += (wx - z.vx) * k; z.vy += (wy - z.vy) * k;
  moveCircle(m, m.solidZ, z, z.vx * dt, z.vy * dt);
  // stuck far away for a long time: send it back to a spawner (as in the classic games)
  z.stuckT += dt;
  if (z.stuckT > 4) {
    const moved = dist(z.x, z.y, z.prog[0], z.prog[1]);
    z.prog = [z.x, z.y]; z.stuckT = 0;
    z.stuckN = moved < 30 && z.tearT === 0 && z.atkT <= 0 && td > 70 ? (z.stuckN || 0) + 1 : 0;
    if ((moved < 30 && td > 500 && z.tearT === 0 && z.atkT <= 0) || z.stuckN >= 3) {
      z.stuckN = 0;
      const ps = ZM.players(G).filter((a) => a.alive && !a.down);
      const s = ZM.pickSpawner(G, ps);
      if (s) { z.x = s.wx; z.y = s.wy; z.rise = 0.8; z.prog = [z.x, z.y]; ev(G, { k: "rise", x: z.x, y: z.y }); }
    }
  }
};

ZM.zombieBoom = function (G, z) {
  if (!z.alive) return;
  z.alive = false; z.hp = 0;
  const B = ZTYPES.exploder.boom;
  ev(G, { k: "die", id: z.id, x: z.x, y: z.y, a: z.ang, zt: "exploder", look: z.look, gib: true });
  explode(G, z.x, z.y, B.r, B.pdmg, B.zdmg, null, "zboom");
  G.z.killed++;
};

ZM.damageZombie = function (G, z, amt, src, how, crit, wid, ang) {
  const Z = G.z;
  if (!z.alive) return;
  const killer = src && src.kind === "soldier" ? src : null;
  if (Z.timers.insta > 0 && z.ztype !== "brute") amt = z.hp + 1;
  if (Z.timers.insta > 0 && z.ztype === "brute") amt *= 3;
  z.hp -= amt;
  z.flinch = 0.12;
  if (ang !== undefined && z.ztype !== "brute") { z.vx += Math.cos(ang) * 60; z.vy += Math.sin(ang) * 60; }
  const mult = Z.timers.double > 0 ? 2 : 1;
  if (killer && how !== "nuke") { killer.points += POINTS.hit * mult; }
  if (z.hp > 0) { if (how !== "boom") ev(G, { k: "zhit", id: z.id, x: z.x, y: z.y, a: ang || 0, crit }); return; }
  // dead
  z.alive = false;
  Z.killed++; Z.totalKills++;
  Z.lastKill = [z.x, z.y];
  if (killer) {
    const pts = how === "knife" ? POINTS.knife : crit ? POINTS.crit : POINTS.kill;
    const gain = how === "nuke" ? 0 : (pts + (ZTYPES[z.ztype].pts - 50)) * mult;
    killer.points += gain; killer.kills++;
    if (crit) killer.crits++;
    ev(G, { k: "pts", pid: killer.id, n: gain + POINTS.hit * mult, x: z.x, y: z.y });
  }
  ev(G, { k: "die", id: z.id, x: z.x, y: z.y, a: ang === undefined ? z.ang : ang, zt: z.ztype, look: z.look, crit, gib: how === "boom" || (crit && Math.random() < 0.5) || wid === "longbow" });
  if (z.ztype === "exploder") { explode(G, z.x, z.y, ZTYPES.exploder.boom.r, ZTYPES.exploder.boom.pdmg, ZTYPES.exploder.boom.zdmg, null, "zboom"); }
  // soldier zombies sometimes drop the gun they were carrying
  if (z.ztype === "soldier" && Math.random() < ZTYPES.soldier.drop) {
    const wid = pick(["mx5", "r4", "k74", "sg12", "dmr", "mx5"]);
    const d = wdef({ id: wid });
    dropWeapon(G, z.x, z.y, { id: wid, up: false, mag: d.mag, res: Math.round(d.res * 0.4) }, 30);
  }
  // power-up drop
  const D = Z.drops;
  if (how !== "nuke" && killer && D.n < DROP.maxPerRound && G.time - D.last > DROP.gap && Math.random() < DROP.chance) ZM.spawnPowerup(G, z.x, z.y);
};

/* ---------------- power-ups ---------------- */
ZM.spawnPowerup = function (G, x, y, type) {
  const Z = G.z;
  if (!type) {
    const pool = Object.entries(POWERUPS).filter(([k]) => !(k === "barrier" && !G.map.windows.some((w) => w.boards < WINDOW_BOARDS)));
    let tot = pool.reduce((t, [, p]) => t + p.w, 0), r = Math.random() * tot;
    for (const [k, p] of pool) { r -= p.w; if (r <= 0) { type = k; break; } }
    type = type || "ammo";
  }
  const p = { id: G.nextId++, type, x, y, t: 26 };
  G.powerups.push(p);
  Z.drops.n++; Z.drops.last = G.time;
  ev(G, { k: "pu_spawn", x, y, t: type });
};

ZM.takePowerup = function (G, p, who) {
  const Z = G.z, ps = ZM.players(G);
  ev(G, { k: "pu_take", t: p.type, x: p.x, y: p.y });
  switch (p.type) {
    case "ammo":
      for (const a of ps) if (a.alive) { for (const s of a.weapons) { const d = wdef(s); s.res = d.res; if (G.cfg.fullMagAmmo) s.mag = d.mag; } a.frags = Math.max(a.frags, 2); }
      break;
    case "double": Z.timers.double = POWERUPS.double.t; break;
    case "insta": Z.timers.insta = POWERUPS.insta.t; break;
    case "sale": Z.timers.sale = POWERUPS.sale.t; break;
    case "nuke": {
      const zs = G.actors.filter((a) => a.kind === "zombie" && a.alive && a.rise <= 0.6);
      for (const z of zs) { z.stun = 2; }
      setTimeoutSim(G, 0.3, () => { for (const z of zs) if (z.alive) ZM.damageZombie(G, z, z.hp + 1, who, "nuke", false, "nuke"); });
      for (const a of ps) if (a.alive) a.points += POINTS.nuke * (Z.timers.double > 0 ? 2 : 1);
      break;
    }
    case "barrier":
      for (const w of G.map.windows) { w.boards = WINDOW_BOARDS; refreshTile(G.map, w.i); ev(G, { k: "board", w: G.map.windows.indexOf(w), n: w.boards, x: w.wx, y: w.wy, quiet: true }); }
      for (const a of ps) if (a.alive) a.points += 200;
      break;
  }
};
// small timed actions inside the simulation
function setTimeoutSim(G, t, fn) { (G.timers || (G.timers = [])).push({ t: G.time + t, fn }); }
function runSimTimers(G) { if (!G.timers || !G.timers.length) return; const due = G.timers.filter((x) => x.t <= G.time); G.timers = G.timers.filter((x) => x.t > G.time); due.forEach((x) => x.fn()); }

/* ---------------- mystery box ---------------- */
ZM.rollBox = function (G, user) {
  const have = user ? user.weapons.map((w) => w.id) : [];
  const pool = WEAPON_IDS.filter((id) => WEAPONS[id].box > 0 && !have.includes(id));
  let tot = pool.reduce((t, id) => t + WEAPONS[id].box, 0), r = Math.random() * tot;
  for (const id of pool) { r -= WEAPONS[id].box; if (r <= 0) return id; }
  return pool[0] || "mx5";
};
ZM.giveWeapon = function (G, a, id, up = false) {
  const slot = newSlot(id, up);
  if (a.weapons.length < 2) { a.weapons.push(slot); a.cur = a.weapons.length - 1; }
  else a.weapons[a.cur] = slot;
  a.reloadT = 0; a.swapT = 0.4;
  ev(G, { k: "snd", s: "pickup", x: a.x, y: a.y, v: 1, o: a.id });
};

/* ---------------- downed / revive ---------------- */
ZM.playerDown = function (G, a) {
  const Z = G.z;
  if (a.down) return;
  a.downs++;
  const solo = ZM.soloLike(G);
  const hadWind = hasPerk(a, "wind");
  a.perks = []; a.maxHp = 150;
  if (solo && hadWind && a.windUses < 3) {
    a.down = true; a.selfRev = 3.2; a.windUses++; a.hp = 1;
    ev(G, { k: "down", id: a.id, self: true });
    return;
  }
  if (solo) { a.alive = false; a.hp = 0; ev(G, { k: "dead", id: a.id }); return; }
  a.down = true; a.bleed = 30; a.hp = 1; a.selfRev = 0;
  // last stand: you keep a pistol
  const pi = a.weapons.findIndex((w) => ["pistol", "magnum"].includes(WEAPONS[w.id].cls));
  if (pi >= 0) a.cur = pi;
  else { a.tempPistol = true; a.weapons.push(newSlot("p9")); a.cur = a.weapons.length - 1; }
  a.reloadT = 0;
  ev(G, { k: "down", id: a.id });
};
ZM.downTick = function (G, a, inp, dt) {
  if (a.selfRev > 0) { a.selfRev -= dt; if (a.selfRev <= 0) ZM.revive(G, a, a); return; }
  a.bleed -= dt * (a.reviver ? 0 : 1);
  a.reviver = null;
  if (a.bleed <= 0) { a.alive = false; a.down = false; ev(G, { k: "dead", id: a.id }); }
};
ZM.revive = function (G, a, by) {
  a.down = false; a.selfRev = 0; a.bleed = 0; a.hp = a.maxHp * (by && by !== a ? 0.6 : 1); a.protectT = 1.5; a.hurtT = G.time;
  if (a.tempPistol) { a.weapons.pop(); a.tempPistol = false; a.cur = 0; }
  if (by && by !== a) { by.revives++; by.points += POINTS.revive; }
  ev(G, { k: "revived", id: a.id });
};

/* ---------------- USE prompts ---------------- */
ZM.prompt = function (G, a) {
  const m = G.map, Z = G.z, mult = 1;
  const near = (x, y, r) => dist2(a.x, a.y, x, y) < r * r;
  // revive a downed teammate
  if (!Z.versus) for (const b of ZM.players(G)) {
    if (b === a || !b.down || !b.alive || b.selfRev > 0) continue;
    if (near(b.x, b.y, 64)) {
      const t = hasPerk(a, "wind") ? 1.5 : 3;
      return { key: "rev" + b.id, label: "HOLD TO REVIVE " + b.name.toUpperCase(), hold: t, can: true, tick: () => { b.reviver = a; }, act: () => ZM.revive(G, b, a) };
    }
  }
  // mystery box weapon waiting for you
  const B = Z.box, bs = m.boxSpots[B.spot];
  if (bs && B.state === "offer" && B.user === a && near(bs.wx, bs.wy, 70)) return { key: "boxtake", label: "TAKE " + WEAPONS[B.wid].name.toUpperCase(), can: true, act: () => { ZM.giveWeapon(G, a, B.wid); B.state = "idle"; B.wid = null; B.user = null; } };
  // weapon on the ground
  for (const d of G.drops) if (near(d.x, d.y, 40) && !a.weapons.some((w) => w.id === d.wid)) return { key: "drop" + d.id, label: "SWAP FOR " + wdef({ id: d.wid, up: d.up }).name.toUpperCase(), can: true, act: () => takeDrop(G, a, d) };
  // repair a window
  for (const w of m.windows) {
    if (w.boards >= WINDOW_BOARDS || !near(w.wx, w.wy, 66)) continue;
    const myArea = m.area[tileOf(m, a.x, a.y)];
    if (myArea >= 0 && !Z.open.has(myArea)) continue;
    const zClose = G.actors.some((z) => z.kind === "zombie" && z.alive && z.atkT > 0 && dist2(z.x, z.y, w.wx, w.wy) < 36 * 36);
    return { key: "win" + w.i, label: "HOLD TO REBUILD BARRIER", hold: 0.55, can: !zClose, why: "ZOMBIE IN THE WAY", act: () => {
      w.boards++; refreshTile(m, w.i);
      const got = Z.boardPts[a.id] || 0;
      if (got < POINTS.boardMax) { const g = POINTS.board * (Z.timers.double > 0 ? 2 : 1); a.points += g; Z.boardPts[a.id] = got + g; ev(G, { k: "pts", pid: a.id, n: g, x: w.wx, y: w.wy }); }
      ev(G, { k: "board", w: m.winAt[w.i], n: w.boards, x: w.wx, y: w.wy, fix: true });
    } };
  }
  // wall guns
  for (const wb of m.wallbuys) {
    if (!near(wb.wx, wb.wy, 58)) continue;
    const d = WEAPONS[wb.gun], has = a.weapons.find((w) => w.id === wb.gun);
    if (has) {
      const cost = has.up ? 2500 : Math.round(d.cost / 2);
      const full = has.res >= wdef(has).res && has.mag >= wdef(has).mag;
      return { key: "wb" + wb.x + "," + wb.y, label: full ? "AMMO FULL" : "BUY AMMO", cost, can: !full && a.points >= cost, why: full ? "AMMO FULL" : "NOT ENOUGH POINTS", act: () => { a.points -= cost; const dd = wdef(has); has.res = dd.res; has.mag = dd.mag; ev(G, { k: "snd", s: "buy", x: a.x, y: a.y, v: 1, o: a.id }); } };
    }
    return { key: "wb" + wb.x + "," + wb.y, label: "BUY " + d.name.toUpperCase(), cost: d.cost, can: a.points >= d.cost, act: () => { a.points -= d.cost; ZM.giveWeapon(G, a, wb.gun); ev(G, { k: "snd", s: "buy", x: a.x, y: a.y, v: 1, o: a.id }); } };
  }
  // doors / debris
  for (const d of m.doors) {
    if (d.open) continue;
    let close = false;
    for (const [cx, cy] of d.cells) if (near((cx + 0.5) * TILE, (cy + 0.5) * TILE, 62)) { close = true; break; }
    if (!close) continue;
    const word = d.style === "debris" ? "CLEAR DEBRIS" : d.style === "gate" ? "OPEN GATE" : "OPEN DOOR";
    return { key: "door" + d.id, label: word, cost: d.cost, can: a.points >= d.cost, act: () => { a.points -= d.cost; ZM.openDoor(G, d); } };
  }
  // perk machines
  for (const p of m.perks) {
    if (!near(p.wx, p.wy, 62)) continue;
    const P = PERKS[p.perk];
    if (p.gone) continue;
    if (hasPerk(a, p.perk)) return { key: "perk" + p.perk, label: P.name + " · OWNED", can: false, why: "YOU ALREADY HAVE IT", act: () => {} };
    if (P.power && !Z.power) return { key: "perk" + p.perk, label: P.name + " · NEEDS POWER", can: false, why: "TURN ON THE POWER FIRST", act: () => {} };
    const solo = ZM.soloLike(G), cost = p.perk === "wind" && solo ? P.soloCost : P.cost;
    if (a.perks.length >= MAX_PERKS) return { key: "perk" + p.perk, label: P.name, cost, can: false, why: "MAX " + MAX_PERKS + " PERKS", act: () => {} };
    return { key: "perk" + p.perk, label: "DRINK " + P.name, sub: P.desc, cost, can: a.points >= cost, act: () => {
      a.points -= cost; a.perks.push(p.perk);
      if (p.perk === "iron") { a.maxHp = 250; a.hp = 250; }
      if (p.perk === "wind" && solo && a.windUses >= 2) { p.gone = true; ev(G, { k: "toast", pid: a.id, t: "LAST SECOND WIND" }); }
      ev(G, { k: "perk", pid: a.id, p: p.perk, x: p.wx, y: p.wy });
    } };
  }
  // mystery box
  if (bs && near(bs.wx, bs.wy, 70)) {
    if (B.state === "idle") { const cost = Z.timers.sale > 0 ? FIRESALE_BOX : BOX_COST; return { key: "box", label: "MYSTERY BOX", cost, can: a.points >= cost, act: () => { a.points -= cost; B.state = "spin"; B.t = 3.6; B.user = a; B.uses++; ev(G, { k: "boxspin", spot: B.spot, x: bs.wx, y: bs.wy }); } }; }
    if (B.state === "spin") return { key: "boxw", label: "SPINNING…", can: false, why: "WAIT FOR IT", act: () => {} };
  }
  // forge (needs power)
  const F = m.forge;
  if (F && near(F.wx, F.wy, 66)) {
    const slot = curSlot(a), d = WEAPONS[slot.id];
    if (!Z.power) return { key: "forge", label: "FORGE · NEEDS POWER", can: false, why: "TURN ON THE POWER FIRST", act: () => {} };
    if (slot.up || !d.up) return { key: "forge", label: "FORGE · " + (slot.up ? "ALREADY UPGRADED" : "CAN'T UPGRADE THIS"), can: false, why: "TRY ANOTHER GUN", act: () => {} };
    return { key: "forge", label: "HOLD TO FORGE " + d.name.toUpperCase(), sub: "→ " + d.up.name, cost: FORGE_COST, hold: 2.2, can: a.points >= FORGE_COST, tick: () => { if (Math.random() < 0.2) ev(G, { k: "spark", x: F.wx, y: F.wy }); },
      act: () => { a.points -= FORGE_COST; slot.up = true; const dd = wdef(slot); slot.mag = dd.mag; slot.res = dd.res; ev(G, { k: "forged", pid: a.id, x: F.wx, y: F.wy, w: dd.name }); } };
  }
  // power switch
  const S = m.power;
  if (S && !Z.power && near(S.wx, S.wy, 62)) return { key: "power", label: "HOLD TO TURN ON THE POWER", hold: 1.2, can: true, act: () => { Z.power = true; ev(G, { k: "power" }); } };
  return null;
};

ZM.openDoor = function (G, d) {
  const m = G.map, Z = G.z;
  d.open = true;
  for (const i of d.tiles) refreshTile(m, i);
  for (const a of d.sides) Z.open.add(a);
  Z.fieldT = 0;
  ev(G, { k: "door", id: d.id, x: d.cx, y: d.cy, style: d.style });
};
