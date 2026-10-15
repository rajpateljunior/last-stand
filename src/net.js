/* Online 2-player over a direct phone-to-phone WebRTC link (PeerJS, same as Wild Riders).
   The free public PeerJS server only introduces the two devices; game data then flows directly between them.
   HOST runs the whole game (zombies, bots, damage, points). GUEST moves its own soldier (so it feels instant),
   shows its own shots right away, and sends its controls; the host sends back the world 20 times a second. */

const NET_PREFIX = "laststand-v1-";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const NetCfg = (() => {
  const q = new URLSearchParams(location.search);
  if (q.get("peerhost")) return { host: q.get("peerhost"), port: +(q.get("peerport") || 9000), path: q.get("peerpath") || "/", secure: false, debug: 1 };
  return { debug: 1 };
})();

function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "peerjs.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("lib")); document.head.appendChild(s); });
}
function makeCode() { let c = ""; for (let i = 0; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return c; }

function openOnline() {
  modal(`<h3>2 PLAYERS · ONLINE</h3>
    <p>Play with a friend on their own phone, iPad or computer. Both of you need the internet. One of you hosts and gets a 4-letter code; the other taps JOIN and types it.</p>
    <p class="mute">The host's choices (mode, map, teams) are used. Works best on Wi-Fi; some cellular networks block direct connections.</p>
    <div class="acts"><button class="btn" data-a="host">HOST</button><button class="btn ghost" data-a="join">JOIN</button><button class="btn sm ghost" data-a="close">CANCEL</button></div>`, (box) => {
    box.querySelector('[data-a="close"]').onclick = () => { SFX.play("back"); closeModal(); };
    box.querySelector('[data-a="host"]').onclick = () => { SFX.play("click"); netHost(); };
    box.querySelector('[data-a="join"]').onclick = () => { SFX.play("click"); netJoinPrompt(); };
  });
}
function netStatus(title, msg) {
  modal(`<h3>${title}</h3>${msg}<div class="acts"><button class="btn sm ghost" data-a="cancel">CANCEL</button></div>`, (box) => {
    box.querySelector('[data-a="cancel"]').onclick = () => { SFX.play("back"); netLeave(); closeModal(); if (App.match) endMatch(true); };
  });
}
function netFail(msg) {
  const wasPlaying = !!App.match;
  netLeave();
  if (wasPlaying) { endMatch(true); }
  modal(`<h3>OOPS</h3><p>${msg}</p><div class="acts"><button class="btn sm" data-a="ok">OK</button></div>`, (box) => { box.querySelector('[data-a="ok"]').onclick = () => closeModal(); });
}

function myHello() { const sv = App.save; return { t: "hello", ver: 1, op: sv.op, loadout: Object.assign({}, sv.lo), name: "FRIEND" }; }

async function netHost() {
  netLeave();
  netStatus("CONNECTING…", "<p>Setting up your room.</p>");
  try { await loadPeerLib(); } catch (_) { return netFail("Couldn't load online play. Check your internet connection."); }
  const N = (App.net = { role: "host", code: makeCode(), conn: null, peer: null, tries: 0, sendT: 0, ev: [], lastIn: {} });
  const open = () => {
    const peer = new Peer(NET_PREFIX + N.code, NetCfg); N.peer = peer;
    peer.on("open", () => netStatus("ROOM CODE", `<div class="codebox">${N.code}</div><p>Tell your friend: open Last Stand → any mode → <b>2 · ONLINE</b> → <b>GO ONLINE</b> → <b>JOIN</b> → type <b>${N.code}</b>.</p><p class="mute">Waiting for your friend…</p>`));
    peer.on("error", (err) => {
      if (err.type === "unavailable-id" && N.tries++ < 4) { peer.destroy(); N.code = makeCode(); return open(); }
      if (App.net !== N) return;
      netFail(["network", "server-error", "socket-error"].includes(err.type) ? "Couldn't reach the matchmaking server. Check your internet and try again." : "Online error: " + err.type);
    });
    peer.on("connection", (conn) => {
      if (N.conn) { conn.on("open", () => { conn.send({ t: "full" }); setTimeout(() => conn.close(), 300); }); return; }
      N.conn = conn; wireConn(N, conn);
    });
  };
  open();
}
function netJoinPrompt() {
  modal(`<h3>JOIN</h3><p>Type the 4-letter code on your friend's screen.</p>
    <input class="codein" id="join-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD">
    <div class="acts"><button class="btn" data-a="join">JOIN</button><button class="btn sm ghost" data-a="cancel">CANCEL</button></div>`, (box) => {
    const inp = box.querySelector("#join-code"); setTimeout(() => inp.focus(), 50);
    inp.addEventListener("input", () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "")));
    const go = () => { const c = inp.value.trim().toUpperCase(); if (c.length !== 4) { toast("CODES ARE 4 LETTERS"); return; } SFX.play("click"); netJoin(c); };
    box.querySelector('[data-a="join"]').onclick = go;
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    box.querySelector('[data-a="cancel"]').onclick = () => { SFX.play("back"); closeModal(); };
  });
}
async function netJoin(code) {
  netLeave();
  netStatus("JOINING " + code + "…", "<p>Connecting to your friend.</p>");
  try { await loadPeerLib(); } catch (_) { return netFail("Couldn't load online play. Check your internet connection."); }
  const N = (App.net = { role: "guest", code, conn: null, peer: null, sendT: 0, cnt: { reload: 0, use: 0, knife: 0, gren: 0, swap: 0 } });
  const peer = new Peer(NetCfg); N.peer = peer;
  peer.on("open", () => {
    const conn = peer.connect(NET_PREFIX + code, { reliable: true, serialization: "json" });
    N.conn = conn; wireConn(N, conn);
    N.timer = setTimeout(() => { if (!N.opened && App.net === N) netFail("Couldn't connect to that room. Check the code, and try both devices on Wi-Fi."); }, 14000);
  });
  peer.on("error", (err) => {
    if (App.net !== N) return;
    netFail(err.type === "peer-unavailable" ? `No room called <b>${code}</b>. Check the code with your friend.` : ["network", "server-error", "socket-error"].includes(err.type) ? "Couldn't reach the matchmaking server. Check your internet." : "Online error: " + err.type);
  });
}
function wireConn(N, conn) {
  conn.on("open", () => {
    N.opened = true; clearTimeout(N.timer);
    if (N.role === "guest") { conn.send(myHello()); netStatus("CONNECTED!", "<p>Waiting for the host to start…</p>"); }
  });
  conn.on("data", (m) => netOnMessage(N, m));
  conn.on("close", () => netLost(N));
  conn.on("error", () => netLost(N));
}
function netSend(m) { const N = App.net; if (N && N.conn && N.conn.open) { try { N.conn.send(m); } catch (_) {} } }

function netOnMessage(N, m) {
  if (App.net !== N || !m || !m.t) return;
  const G = App.match;
  switch (m.t) {
    case "full": netFail("That room already has two players."); break;
    case "hello": N.guest = m; netStartHost(); break;
    case "start": netStartGuest(m.cfg); break;
    case "ready": if (G) { G.hold = false; closeModal(); } break;
    case "i": if (G) netHostInput(G, m); break;
    case "s": if (G) netGuestApply(G, m); break;
    case "over": if (G) { G.over = true; G.winner = m.w; if (m.final) netApplyFinal(G, m.final); } break;
    case "again": if (N.role === "host") netStartHost(); break;
    case "bye": netLost(N, true); break;
  }
}

function netStartHost() {
  const N = App.net, S = App.setup || { mode: App.save.last.mode, map: App.save.last.map, variant: "coop", diff: App.save.settings.diff };
  const sv = App.save, g = N.guest;
  const tdmRivals = S.mode === "tdm" && S.variant === "versus";
  const cfg = { mode: S.mode, mapId: S.map, variant: S.variant, diff: S.diff, seed: (Math.random() * 1e9) | 0, online: true,
    players: [{ pidx: 0, op: sv.op, name: "HOST", team: 0, loadout: Object.assign({}, sv.lo), netId: 0 },
      { remote: true, op: g.op, name: "FRIEND", team: tdmRivals ? 1 : 0, loadout: g.loadout, netId: 1 }] };
  netSend({ t: "start", cfg });
  N.ev = [];
  startMatch(cfg, { role: "host" }).then(() => {
    const G = App.match; if (!G) return;
    G.hold = true;
    netStatus("GET READY", "<p>Waiting for your friend to load…</p>");
  });
}
function netStartGuest(cfg) {
  const mine = JSON.parse(JSON.stringify(cfg));
  mine.players[0].remote = true; delete mine.players[0].pidx;
  mine.players[1].remote = false; mine.players[1].pidx = 0;
  startMatch(mine, { role: "guest" }).then(() => {
    const G = App.match; if (!G) return;
    G.me = G.humans.find((h) => !h.remote);
    G.byId = new Map(G.actors.map((a) => [a.id, a]));
    netSend({ t: "ready" });
  });
}

/* ---------- guest → host: controls ---------- */
function netGuestFrame(G, dt) {
  const N = App.net; if (!N || !G.me) return;
  N.sendT -= dt; if (N.sendT > 0) return; N.sendT = 1 / 30;
  const me = G.me, I = N.lastInp || {};
  netSend({ t: "i", x: Math.round(me.x), y: Math.round(me.y), a: +me.ang.toFixed(3), f: I.fire ? 1 : 0, h: I.useHold ? 1 : 0, gd: Math.round(I.grenDist || 280), c: N.cnt });
}
// count button presses so none get lost between packets
function netGuestEdges(inp) {
  const N = App.net; if (!N) return;
  for (const k of ["reload", "use", "knife", "gren", "swap"]) if (inp[k]) N.cnt[k]++;
  N.lastInp = inp;
}
function netHostInput(G, m) {
  const a = G.actors.find((x) => x.remote && x.kind === "soldier");
  if (!a) return;
  a.netPos = [m.x, m.y];
  const last = a.lastCnt || { reload: 0, use: 0, knife: 0, gren: 0, swap: 0 };
  const inp = a.netInp || (a.netInp = {});
  inp.aim = m.a; inp.fire = !!m.f; inp.useHold = !!m.h; inp.grenDist = m.gd;
  for (const k in m.c) { if (m.c[k] > last[k]) inp[k] = true; }
  a.lastCnt = Object.assign({}, m.c);
}
// after the host steps once, clear the one-shot buttons it used
function netHostConsume(G) { for (const a of G.actors) if (a.remote && a.netInp) for (const k of ["reload", "use", "knife", "gren", "swap"]) a.netInp[k] = false; }

/* ---------- host → guest: the world ---------- */
const NO_FWD = { flash: 1, tracer: 1, shell: 1 };
function netHostFrame(G, dt, events) {
  const N = App.net; if (!N || !N.conn || G.hold) return;
  const guest = G.actors.find((x) => x.remote && x.kind === "soldier");
  for (const e of events) { if (guest && e.o === guest.id && (NO_FWD[e.k] || e.k === "snd" || e.k === "impact")) continue; N.ev.push(e); }
  N.sendT -= dt; if (N.sendT > 0) return; N.sendT = 1 / 20;
  const A = [];
  for (const a of G.actors) {
    if (!a.alive && a.kind === "zombie") continue;
    if (a.kind === "soldier") {
      const s = curSlot(a);
      A.push(["s", a.id, Math.round(a.x), Math.round(a.y), +a.ang.toFixed(2), Math.round(a.hp), a.maxHp, a.team, a.op, a.name, s.id, s.up ? 1 : 0, Math.round(a.vx), Math.round(a.vy),
        (a.alive ? 1 : 0) | (a.down ? 2 : 0) | (a.reloadT > 0 ? 4 : 0) | (a.knifeT > 0 ? 8 : 0) | (a.protectT > 0 ? 16 : 0) | (a.human ? 32 : 0) | (G.time - a.lastShot < 0.2 ? 64 : 0), +(a.knifeT || 0).toFixed(2), a.kills, a.deaths, a.points, a.streak, a.bestStreak, a.netId === undefined ? -1 : a.netId]);
    } else {
      A.push(["z", a.id, Math.round(a.x), Math.round(a.y), +a.ang.toFixed(2), Math.round((a.hp / a.maxHp) * 100), a.ztype, a.look, +Math.max(0, a.rise).toFixed(2), +Math.max(0, a.atkT).toFixed(2), Math.round(a.vx), Math.round(a.vy), Math.round(a.speed), a.fuse > 0 ? 1 : 0]);
    }
  }
  const m = G.map, msg = { t: "s", a: A, ev: N.ev, p: G.projs.filter((p) => !p.nuke).map((p) => [p.kind, Math.round(p.x), Math.round(p.y), Math.round(p.h || 0), +p.t.toFixed(2), p.r || 0]),
    d: G.drops.map((d) => [d.id, d.wid, d.up ? 1 : 0, Math.round(d.x), Math.round(d.y), +d.a.toFixed(2), Math.round(d.t)]),
    pu: G.powerups.map((p) => [p.id, p.type, Math.round(p.x), Math.round(p.y), +p.t.toFixed(1)]),
    doors: m.doors.map((d) => (d.open ? 1 : 0)), wins: m.windows.map((w) => w.boards), brl: m.barrels.map((b) => (b.alive ? 1 : 0)), over: G.over ? 1 : 0, w: G.winner && G.winner.id ? G.winner.id : G.winner };
  if (G.z) { const Z = G.z, B = Z.box; msg.z = [Z.round, Z.phase, +Z.phaseT.toFixed(1), Z.total, Z.killed, Z.power ? 1 : 0, [B.spot, B.state, +B.t.toFixed(2), B.wid, B.user ? B.user.id : 0], [+Z.timers.double.toFixed(1), +Z.timers.insta.toFixed(1), +Z.timers.sale.toFixed(1)], [...Z.open], m.perks.map((p) => (p.gone ? 1 : 0)), Z.spawned]; }
  if (G.t) msg.td = [G.t.score, +G.t.timeLeft.toFixed(1), G.t.recon];
  if (guest) {
    msg.me = { hp: guest.hp, mx: guest.maxHp, al: guest.alive ? 1 : 0, dn: guest.down ? 1 : 0, bl: +(guest.bleed || 0).toFixed(1), sr: +(guest.selfRev || 0).toFixed(1), pts: guest.points, k: guest.kills, d: guest.deaths, st: guest.streak,
      w: guest.weapons.map((s) => [s.id, s.up ? 1 : 0, s.mag, s.res]), cur: guest.cur, rl: +guest.reloadT.toFixed(2), rd: guest.reloadDur, fr: guest.frags, pk: guest.perks, rs: +(guest.respawnT || 0).toFixed(1), pr: guest.protectT > 0 ? 1 : 0, tp: guest.tp || 0, x: Math.round(guest.x), y: Math.round(guest.y) };
  }
  netSend(msg);
  N.ev = [];
}

/* guest: apply the host's world */
function netGuestApply(G, m) {
  const me = G.me; if (!me) return;
  const seen = new Set();
  for (const e of m.a) {
    const id = e[1]; seen.add(id);
    if (me && id === me.id) continue;
    let a = G.byId.get(id);
    if (e[0] === "s") {
      if (!a) { a = makeSoldier(G, { team: e[7], op: e[8], name: e[9], x: e[2], y: e[3], human: !!(e[14] & 32), remote: true }); a.id = id; G.byId.set(id, a); a.guestCopy = true; }
      a.tx = e[2]; a.ty = e[3]; a.ang = e[4]; a.hp = e[5]; a.maxHp = e[6]; a.team = e[7]; a.op = e[8]; a.name = e[9];
      if (!a.weapons[0] || a.weapons[0].id !== e[10] || a.weapons[0].up !== !!e[11]) { a.weapons = [{ id: e[10], up: !!e[11], mag: 1, res: 0 }]; a.cur = 0; }
      a.vx = e[12]; a.vy = e[13];
      const f = e[14];
      if (!a.alive && f & 1) { a.x = e[2]; a.y = e[3]; }
      a.alive = !!(f & 1); a.down = !!(f & 2); a.reloadT = f & 4 ? 1 : 0; a.knifeT = e[15]; a.protectT = f & 16 ? 1 : 0; a.lastShot = f & 64 ? G.time : a.lastShot;
      a.kills = e[16]; a.deaths = e[17]; a.points = e[18]; a.streak = e[19]; a.bestStreak = e[20];
    } else {
      if (!a) { a = { id, kind: "zombie", ztype: e[6], look: e[7], x: e[2], y: e[3], vx: 0, vy: 0, r: ZTYPES[e[6]].r, ang: e[4], hp: 1, maxHp: 1, alive: true, speed: e[12], walk: Math.random() * 10, rise: e[8], atkT: 0, flash: 0 }; G.actors.push(a); G.byId.set(id, a); }
      a.tx = e[2]; a.ty = e[3]; a.ang = e[4]; a.hp = e[5]; a.maxHp = 100; a.rise = e[8]; a.atkT = e[9]; a.vx = e[10]; a.vy = e[11]; a.speed = e[12]; a.fuse = e[13]; a.alive = true;
    }
  }
  for (const a of G.actors) if (a !== me && !seen.has(a.id) && a.kind === "zombie") a.alive = false;
  G.actors = G.actors.filter((a) => a.alive || a.kind === "soldier");
  for (const [id, a] of G.byId) if (!G.actors.includes(a)) G.byId.delete(id);
  // world state
  const mp = G.map;
  m.doors.forEach((o, k) => { const d = mp.doors[k]; if (d && d.open !== !!o) { d.open = !!o; d.tiles.forEach((i) => refreshTile(mp, i)); if (G.z && o) d.sides.forEach((s) => G.z.open.add(s)); } });
  m.wins.forEach((b, k) => { const w = mp.windows[k]; if (w && w.boards !== b) { w.boards = b; refreshTile(mp, w.i); } });
  m.brl.forEach((b, k) => { const br = mp.barrels[k]; if (br && br.alive !== !!b) { br.alive = !!b; refreshTile(mp, br.i); } });
  G.projs = m.p.map(([kind, x, y, h, t, r]) => ({ kind, x, y, h, t, r }));
  G.drops = m.d.map(([id, wid, up, x, y, a, t]) => ({ id, wid, up: !!up, x, y, a, t, mag: 1, res: 0 }));
  G.powerups = m.pu.map(([id, type, x, y, t]) => ({ id, type, x, y, t }));
  if (m.z && G.z) {
    const Z = G.z, z = m.z;
    Z.round = z[0]; Z.phase = z[1]; Z.phaseT = z[2]; Z.total = z[3]; Z.killed = z[4]; Z.power = !!z[5];
    const B = Z.box; B.spot = z[6][0]; B.state = z[6][1]; B.t = z[6][2]; B.wid = z[6][3]; B.user = z[6][4] === me.id ? me : z[6][4] ? { id: z[6][4] } : null;
    Z.timers.double = z[7][0]; Z.timers.insta = z[7][1]; Z.timers.sale = z[7][2];
    Z.open = new Set(z[8]); mp.perks.forEach((p, k) => (p.gone = !!z[9][k])); Z.spawned = z[10];
  }
  if (m.td && G.t) { G.t.score = m.td[0]; G.t.timeLeft = m.td[1]; G.t.recon = m.td[2]; }
  // my own soldier: everything except where I am (unless the host moved me: respawn)
  const s = m.me;
  if (s) {
    if ((me.tp || 0) !== s.tp) { me.tp = s.tp; me.x = s.x; me.y = s.y; }
    me.hp = s.hp; me.maxHp = s.mx; me.alive = !!s.al; me.down = !!s.dn; me.bleed = s.bl; me.selfRev = s.sr; me.points = s.pts; me.kills = s.k; me.deaths = s.d; me.streak = s.st;
    me.weapons = s.w.map(([id, up, mag, res]) => ({ id, up: !!up, mag, res })); me.cur = clamp(s.cur, 0, me.weapons.length - 1);
    me.reloadT = s.rl; me.reloadDur = s.rd || 1; me.frags = s.fr; me.perks = s.pk; me.respawnT = s.rs; me.protectT = s.pr ? 1 : 0;
  }
  for (const e of m.ev) G.vev.push(e);
  if (m.over && !G.over) { G.over = true; G.winner = typeof m.w === "number" && G.mode === "zombies" ? G.actors.find((a) => a.id === m.w) : m.w; }
}
function netApplyFinal() {}

/* guest step: only my own soldier runs here; everyone else follows the host */
function guestStep(G, inp, dt) {
  G.time += dt; G.frame++;
  hashClear(G.hash);
  for (const a of G.actors) if (a.alive) hashAdd(G.hash, a);
  const me = G.me;
  if (me) stepSoldier(G, me, inp, dt);
  const k = Math.min(1, dt * 14);
  for (const a of G.actors) {
    if (a === me || a.tx === undefined) continue;
    a.x += (a.tx + (a.vx || 0) * 0.05 - a.x) * k; a.y += (a.ty + (a.vy || 0) * 0.05 - a.y) * k;
    a.walk = (a.walk || 0) + Math.hypot(a.vx || 0, a.vy || 0) * dt * (a.kind === "zombie" ? 0.045 : 0.06);
    if (a.kind === "soldier" && Math.hypot(a.vx, a.vy) > 20) a.moveAng = Math.atan2(a.vy, a.vx);
    if (a.flash > 0) a.flash -= dt;
  }
}

function netLost(N, bye) {
  if (App.net !== N || N.lost) return;
  N.lost = true;
  const G = App.match;
  if (G && G.net) {
    if (N.role === "host") {
      // keep playing: zombies → your friend is gone; TDM → a bot takes their place
      for (const a of G.actors) if (a.remote) {
        a.remote = false; a.human = false; a.name = a.name + " (left)";
        if (G.mode === "tdm") a.bot = { diff: DIFF[G.cfg.diff] || DIFF.regular, t: 0, aimErr: 0 }; else { a.alive = false; }
      }
      G.humans = G.humans.filter((h) => !h.remote && h.human);
      G.net = null; G.hold = false;
      closeModal();
      toast(bye ? "YOUR FRIEND LEFT" : "CONNECTION LOST");
    } else {
      App.net = null;
      netFail(bye ? "The host left the game." : "The connection to the host dropped.");
    }
  } else if (N.opened) netFail(bye ? "Your friend left the room." : "The connection dropped.");
}
function netLeave() {
  const N = App.net; if (!N) return;
  App.net = null;
  try { if (N.conn && N.conn.open) N.conn.send({ t: "bye" }); } catch (_) {}
  setTimeout(() => { try { N.conn && N.conn.close(); } catch (_) {} try { N.peer && N.peer.destroy(); } catch (_) {} }, 150);
  clearTimeout(N.timer);
}
