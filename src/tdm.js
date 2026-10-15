/* TEAM DEATHMATCH: two teams of four (bots fill empty spots), respawns, weapon drops, killstreaks. */

const TD = {};

TD.init = function (G) {
  const cfg = G.cfg, m = G.map;
  G.t = { score: [0, 0], timeLeft: cfg.time || TDM.time, limit: cfg.limit || TDM.scoreLimit, recon: [0, 0], over: false };
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const teams = [[], []];
  for (const p of cfg.players || []) teams[p.team || 0].push(p);
  const diff = DIFF[cfg.diff] || DIFF.regular;
  for (let t = 0; t < 2; t++) {
    const humans = teams[t];
    const size = cfg.teamSize || TDM.size;
    for (let k = 0; k < size; k++) {
      const p = humans[k];
      const spot = m.spawns[t][k % m.spawns[t].length];
      const o = p
        ? { human: !p.bot, pidx: p.pidx, remote: p.remote, netId: p.netId, op: p.op, name: p.name, loadout: p.loadout }
        : { human: false, op: pick(OPERATORS).id, name: names.pop() || "Bot", loadout: TD.botLoadout() };
      const a = makeSoldier(G, Object.assign(o, { team: t, x: spot.wx + rnd(-8, 8), y: spot.wy + rnd(-8, 8), ang: t === 0 ? 0 : Math.PI, hp: TDM.hp,
        weapons: TD.loadoutSlots(o.loadout), frags: 2, bot: p && !p.bot ? null : { diff, t: rnd(0.3), aimErr: rnd(-1, 1), path: null, goal: null } }));
      a.loadout = o.loadout;
      a.protectT = TDM.protect;
    }
  }
};

TD.botLoadout = () => ({ p: pick(["mx5", "mx5", "r4", "r4", "k74", "k74", "sg12", "dmr", "hammer", "longbow", "sweeper"]), s: Math.random() < 0.8 ? "p9" : "magnum" });
TD.loadoutSlots = (lo) => { lo = lo || { p: "mx5", s: "p9" }; return [newSlot(lo.p), newSlot(lo.s || "p9")]; };

TD.step = function (G, dt) {
  const T = G.t;
  if (G.over) return;
  T.timeLeft -= dt;
  for (let k = 0; k < 2; k++) if (T.recon[k] > 0) T.recon[k] -= dt;
  if (T.timeLeft <= 0 || T.score[0] >= T.limit || T.score[1] >= T.limit) {
    G.over = true; T.timeLeft = Math.max(0, T.timeLeft);
    G.winner = T.score[0] === T.score[1] ? -1 : T.score[0] > T.score[1] ? 0 : 1;
    ev(G, { k: "gameover", winner: G.winner });
  }
  runSimTimers(G);
};

TD.kill = function (G, v, src, how, wid, crit) {
  const T = G.t;
  v.alive = false; v.deaths++; v.respawnT = TDM.respawn; v.streak = 0; v.reloadT = 0;
  const pri = v.weapons[0];
  if (pri) dropWeapon(G, v.x, v.y, pri);
  let killer = src && src.kind === "soldier" ? src : null;
  if (killer && killer.team !== v.team) {
    killer.kills++; killer.streak++; killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
    if (crit) killer.crits++;
    T.score[killer.team]++;
    for (const s of STREAKS) if (killer.streak === s.kills) TD.award(G, killer, s);
  } else if (killer === v) {
    T.score[v.team] = Math.max(0, T.score[v.team] - 1);
  }
  ev(G, { k: "die", id: v.id, x: v.x, y: v.y, a: src ? angTo(src.x, src.y, v.x, v.y) : v.ang, soldier: true, op: v.op, team: v.team, gib: how === "boom" });
  ev(G, { k: "feed", a: killer ? killer.name : "", at: killer ? killer.team : -1, v: v.name, vt: v.team, w: how === "knife" ? "KNIFE" : how === "boom" ? (wid === "air" ? "AIRSTRIKE" : wid === "frag" ? "FRAG" : "EXPLOSION") : WEAPONS[wid] ? WEAPONS[wid].name : "", crit, ak: killer && killer.human ? killer.id : 0, vk: v.human ? v.id : 0 });
};

TD.award = function (G, a, s) {
  ev(G, { k: "streak", pid: a.id, team: a.team, name: s.name, by: a.name });
  if (s.id === "recon") G.t.recon[a.team] = s.t;
  if (s.id === "air") {
    // aim at the biggest group of enemies
    const en = G.actors.filter((b) => b.kind === "soldier" && b.alive && b.team !== a.team);
    if (!en.length) return;
    let best = en[0], bn = -1;
    for (const e of en) { const n = en.filter((o) => dist(o.x, o.y, e.x, e.y) < 240).length; if (n > bn) { bn = n; best = e; } }
    const cx = best.x, cy = best.y, ang = rnd(TAU);
    ev(G, { k: "airwarn", x: cx, y: cy, team: a.team });
    for (let k = 0; k < 6; k++) {
      const off = (k - 2.5) * 70;
      G.projs.push({ kind: "shell", x: cx + Math.cos(ang) * off + rnd(-30, 30), y: cy + Math.sin(ang) * off + rnd(-30, 30), t: 1.8 + k * 0.2, r: 150, dmg: 170, zdmg: 0, owner: a, wid: "air" });
    }
  }
};

TD.deadTick = function (G, a, dt) {
  if (G.over) return;
  a.respawnT -= dt;
  if (a.respawnT <= 0) TD.respawn(G, a);
};

TD.respawn = function (G, a) {
  const m = G.map, spots = m.spawns[a.team];
  const en = G.actors.filter((b) => b.kind === "soldier" && b.alive && b.team !== a.team);
  let best = spots[0], bs = -1;
  for (const s of spots) {
    let dmin = 1e9; for (const e of en) dmin = Math.min(dmin, dist(s.wx, s.wy, e.x, e.y));
    const sc = dmin + rnd(0, 120);
    if (sc > bs) { bs = sc; best = s; }
  }
  a.x = best.wx + rnd(-6, 6); a.y = best.wy + rnd(-6, 6); a.vx = a.vy = 0;
  a.alive = true; a.hp = a.maxHp; a.protectT = TDM.protect; a.frags = 2; a.reloadT = 0; a.spreadAdd = 0;
  if (a.bot && !a.human) a.loadout = TD.botLoadout();
  a.weapons = TD.loadoutSlots(a.loadout); a.cur = 0;
  a.ang = a.team === 0 ? 0 : Math.PI;
  a.tp = (a.tp || 0) + 1;
  if (a.bot) { a.bot.path = null; a.bot.goal = null; a.bot.target = null; }
  ev(G, { k: "spawn", id: a.id });
};

/* two players on one screen: never let them get further apart than the camera can show */
TD.leash = function (G, a) {
  if (!a.human) return;
  const o = G.humans.find((h) => h !== a && h.alive && !h.remote);
  if (!o || !a.alive) return;
  const L = G.leashLen || 700, d = dist(a.x, a.y, o.x, o.y);
  if (d > L) { const k = (d - L) / d; a.x -= (a.x - o.x) * k; a.y -= (a.y - o.y) * k; resolveCircle(G.map, G.map.solidP, a); }
};
