/* Menus, match setup, armory, results, settings, saving (with copy-and-paste save codes), ranks and unlocks. */

const SAVE_KEY = "last-stand-save-v1";
const RESCUE_KEY = "last-stand-save-v1-rescue";
function defaultSave() {
  return {
    v: 1, xp: 0, op: "hawk", op2: "nova", lo: { p: "mx5", s: "p9" }, lo2: { p: "r4", s: "p9" },
    best: {}, bestCoop: {}, stats: { matches: 0, zKills: 0, tKills: 0, wins: 0, rounds: 0, crits: 0, deaths: 0, bestStreak: 0 },
    settings: { music: true, sfx: true, tone: "standard", gfx: "auto", assist: true, diff: "regular" },
    seenHelp: false, last: { mode: "zombies", map: "outpost", players: "solo", variant: "coop", diff: "regular" },
  };
}
function mergeSave(base, s) {
  const out = Object.assign(base, s);
  out.settings = Object.assign(defaultSave().settings, s.settings || {});
  out.stats = Object.assign(defaultSave().stats, s.stats || {});
  out.last = Object.assign(defaultSave().last, s.last || {});
  out.lo = Object.assign(defaultSave().lo, s.lo || {}); out.lo2 = Object.assign(defaultSave().lo2, s.lo2 || {});
  out.best = s.best || {}; out.bestCoop = s.bestCoop || {};
  return out;
}
function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (_) {}
  if (!raw) return defaultSave();
  try {
    const s = JSON.parse(raw);
    if (s && s.v === 1) return mergeSave(defaultSave(), s);
  } catch (_) {}
  // unreadable: keep a copy instead of overwriting it
  try { localStorage.setItem(RESCUE_KEY, raw); } catch (_) {}
  return defaultSave();
}
function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(App.save)); } catch (_) {} }
function encodeSave() { return "LSTAND1-" + btoa(unescape(encodeURIComponent(JSON.stringify(App.save)))); }
function decodeSave(code) {
  try {
    const c = code.trim().replace(/\s+/g, "");
    if (!c.startsWith("LSTAND1-")) return null;
    const s = JSON.parse(decodeURIComponent(escape(atob(c.slice(8)))));
    return s && s.v === 1 ? mergeSave(defaultSave(), s) : null;
  } catch (_) { return null; }
}
const myRank = () => rankOf(App.save.xp);
const opUnlocked = (op) => myRank() >= op.rank;
const gunUnlocked = (id) => myRank() >= WEAPONS[id].rank;

const App = { save: null, screen: null, match: null, demo: null, paused: false, views: [], setup: null, net: null, lastCfg: null };

function show(id) {
  $$(".screen").forEach((s) => s.classList.add("hidden"));
  if (id) $("#" + id).classList.remove("hidden");
  App.screen = id;
  refreshUpdateBanner && refreshUpdateBanner();
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.classList.add("out"), 1600); setTimeout(() => t.remove(), 2200);
}
function modal(html, onMount) {
  const m = $("#modal"), box = m.querySelector(".mbox");
  box.className = "mbox"; box.innerHTML = html; m.classList.remove("hidden");
  onMount && onMount(box);
}
function closeModal() { $("#modal").classList.add("hidden"); }

/* ---------------- title ---------------- */
function renderTitle() {
  show("scr-title");
  const r = myRank(), xp = App.save.xp, a = xpForRank(r), b = xpForRank(Math.min(MAX_RANK, r + 1));
  $("#rank-chip").innerHTML = `<span class="rk">${r}</span><span class="rn">${RANK_NAMES[r]}</span><span class="rb"><i style="width:${r >= MAX_RANK ? 100 : Math.round(((xp - a) / Math.max(1, b - a)) * 100)}%"></i></span>`;
  $("#emblem").innerHTML = emblemSVG();
  const bests = MAP_DEFS.map((d) => App.save.best[d.id] || 0);
  $("#title-best").textContent = Math.max(...bests) ? "BEST ZOMBIES ROUND: " + Math.max(...bests) : "";
  SFX.music("menu");
  SFX.ambient(null);
}

/* ---------------- match setup ---------------- */
function openSetup(mode) {
  SFX.play("click");
  const L = App.save.last;
  App.setup = { mode, players: L.players || "solo", variant: L.variant || "coop", map: L.map || "outpost", diff: App.save.settings.diff || "regular" };
  renderSetup();
  show("scr-setup");
}
function seg(name, opts, cur) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button class="${v === cur ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div>`;
}
function renderSetup() {
  const S = App.setup, z = S.mode === "zombies";
  $("#setup-h").textContent = z ? "ZOMBIES" : "TEAM DEATHMATCH";
  const two = S.players !== "solo";
  let html = `<div class="row"><label>PLAYERS</label>${seg("players", [["solo", "SOLO"], ["shared", "2 · ONE SCREEN"], ["online", "2 · ONLINE"]], S.players)}</div>`;
  if (two) html += `<div class="row"><label>${z ? "TOGETHER?" : "TEAMS"}</label>${seg("variant", z ? [["coop", "CO-OP"], ["versus", "VERSUS"]] : [["coop", "SAME TEAM"], ["versus", "RIVALS"]], S.variant)}</div>`;
  if (!z) html += `<div class="row"><label>BOTS</label>${seg("diff", Object.entries(DIFF).map(([k, d]) => [k, d.name]), S.diff)}</div>`;
  html += `<div class="row"><label>OPERATOR</label><div class="opchips">${opChips("op", App.save.op)}</div></div>`;
  if (S.players === "shared") html += `<div class="row"><label>PLAYER 2</label><div class="opchips">${opChips("op2", App.save.op2)}</div></div>`;
  if (!z) {
    html += `<div class="row"><label>LOADOUT</label><div class="lo">${loChips("lo", App.save.lo)}</div></div>`;
    if (S.players === "shared") html += `<div class="row"><label>P2 LOADOUT</label><div class="lo">${loChips("lo2", App.save.lo2)}</div></div>`;
  }
  $("#setup-opts").innerHTML = html;
  // maps
  $("#setup-maps").innerHTML = MAP_DEFS.map((d) => {
    const best = (S.variant === "coop" && two ? App.save.bestCoop : App.save.best)[d.id] || 0;
    return `<button class="mapcard ${d.id === S.map ? "sel" : ""}" data-map="${d.id}"><div class="mthumb">${mapThumb(d)}</div><b>${d.name}</b><small>${d.sub}</small>${z && best ? `<em>BEST ROUND ${best}</em>` : ""}</button>`;
  }).join("");
  const md = MAP_DEFS.find((d) => d.id === S.map);
  $("#setup-desc").textContent = md.desc + (z ? "" : " · First team to " + TDM.scoreLimit + " kills, " + TDM.time / 60 + " minutes.");
  $("#setup-go").textContent = S.players === "online" ? "GO ONLINE ›" : "DEPLOY ›";
  // wiring
  $$("#setup-opts .seg").forEach((sg) => sg.querySelectorAll("button").forEach((b) => b.onclick = () => {
    SFX.play("click"); S[sg.dataset.seg] = b.dataset.v;
    if (sg.dataset.seg === "diff") { App.save.settings.diff = b.dataset.v; saveGame(); }
    renderSetup();
  }));
  $$("#setup-opts [data-op]").forEach((b) => b.onclick = () => {
    const op = OPERATORS.find((o) => o.id === b.dataset.id);
    if (!opUnlocked(op)) { toast("REACH RANK " + op.rank + " TO UNLOCK " + op.name); return; }
    SFX.play("click"); App.save[b.dataset.op] = op.id; saveGame(); renderSetup();
  });
  $$("#setup-opts [data-lo]").forEach((b) => b.onclick = () => {
    const id = b.dataset.id;
    if (!gunUnlocked(id)) { toast("REACH RANK " + WEAPONS[id].rank + " TO UNLOCK " + WEAPONS[id].name.toUpperCase()); return; }
    SFX.play("click"); App.save[b.dataset.lo][WEAPONS[id].slot] = id; saveGame(); renderSetup();
  });
  $$("#setup-maps .mapcard").forEach((b) => b.onclick = () => { SFX.play("click"); S.map = b.dataset.map; renderSetup(); });
}
function opChips(key, cur) {
  return OPERATORS.map((o) => {
    const lock = !opUnlocked(o);
    return `<button data-op="${key}" data-id="${o.id}" class="opc ${o.id === cur ? "on" : ""} ${lock ? "lock" : ""}" title="${o.desc}"><span class="opface">${opFaceSVG(o)}</span>${lock ? "RANK " + o.rank : o.name}</button>`;
  }).join("");
}
function loChips(key, lo) {
  const prim = WEAPON_IDS.filter((id) => WEAPONS[id].slot === "p" && WEAPONS[id].rank < 99), sec = WEAPON_IDS.filter((id) => WEAPONS[id].slot === "s");
  const chip = (id, cur) => { const w = WEAPONS[id], lock = !gunUnlocked(id); return `<button data-lo="${key}" data-id="${id}" class="gun ${cur === id ? "on" : ""} ${lock ? "lock" : ""}">${lock ? "🔒 R" + w.rank : w.name.replace(/ (SMG|Rifle|Carbine|Pump|LMG|Sniper|Launcher|Pistol|DMR|Auto-12)$/i, "")}</button>`; };
  return `<div class="gl">${prim.map((id) => chip(id, lo.p)).join("")}</div><div class="gl">${sec.map((id) => chip(id, lo.s)).join("")}</div>`;
}
function opFaceSVG(o) {
  const c = makeCanvas(48, 48), g = c.getContext("2d");
  g.translate(24, 24); g.scale(2.2, 2.2); g.rotate(-Math.PI / 2);
  g.fillStyle = o.vest; g.beginPath(); g.ellipse(-2, 0, 8, 12.5, 0, 0, TAU); g.fill();
  drawHead(g, o, 13, 0);
  return `<img src="${c.toDataURL()}" alt="">`;
}
const _thumbs = {};
function mapThumb(def) {
  if (_thumbs[def.id]) return _thumbs[def.id];
  const rows = def.rows, s = 3, c = makeCanvas(64 * s, 40 * s), g = c.getContext("2d");
  const th = def.theme;
  const col = { "#": th.perim[1], ",": th.in.base, ":": th.road, "=": th.pave, ".": th.out.base, k: "#8a7a3a", D: "#c9a34a", W: "#7ab0d0", c: "#6a5034", v: "#7a3030", o: "#8a7c56", f: "#9a9aa0", T: "#24401f", b: "#c02020", g: "#888" };
  for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) { g.fillStyle = col[rows[y][x]] || th.out.base; g.fillRect(x * s, y * s, s, s); }
  _thumbs[def.id] = `<img src="${c.toDataURL()}" alt="">`;
  return _thumbs[def.id];
}

function setupGo() {
  const S = App.setup, sv = App.save;
  SFX.play("click");
  sv.last = { mode: S.mode, map: S.map, players: S.players, variant: S.variant, diff: S.diff };
  saveGame();
  if (S.players === "online") { openOnline(); return; }
  const players = [{ pidx: 0, op: sv.op, name: "YOU", team: 0, loadout: Object.assign({}, sv.lo) }];
  if (S.players === "shared") players.push({ pidx: 1, op: sv.op2, name: "P2", team: S.mode === "tdm" && S.variant === "versus" ? 1 : 0, loadout: Object.assign({}, sv.lo2) });
  if (S.players === "shared") players[0].name = "P1";
  const cfg = { mode: S.mode, mapId: S.map, variant: S.players === "solo" ? "solo" : S.variant, diff: S.diff, players, sameScreen: S.players === "shared",
    split: S.players === "shared" && S.mode === "tdm" && S.variant === "versus", seed: (Math.random() * 1e9) | 0 };
  startMatch(cfg);
}

/* ---------------- match lifecycle ---------------- */
async function startMatch(cfg, net) {
  closeModal();
  show(null);
  $("#loading").classList.remove("hidden");
  $("#loading .tip").textContent = pick(TIPS[cfg.mode]);
  stopDemo();
  await new Promise((r) => setTimeout(r, 40));
  App.lastCfg = cfg;
  resetInput();
  const G = newMatch(cfg);
  if (net) G.net = net;
  initRender(G);
  App.match = G; App.paused = false; App.overT = 0;
  setupViews(G);
  Input.enabled = true;
  Input.split2k = cfg.sameScreen && !IS_TOUCH;
  Input.onPause = () => { if (!App.paused && App.match && !App.match.over) pauseMatch(); };
  $("#loading").classList.add("hidden");
  SFX.music(cfg.mode === "zombies" ? "zombies" : "tdm");
  SFX.ambient(G.map.theme.weather === "rain" ? "rain" : G.map.theme.weather === "fog" ? "fog" : "city");
  resize(true);
  if (!App.save.seenHelp && !net) { App.save.seenHelp = true; saveGame(); pauseMatch(true); openHelp(() => resumeMatch()); }
}
const TIPS = {
  zombies: ["TIP: Rebuild the window boards between rounds. Each board is 10 points.", "TIP: The knife kills in one hit in the first rounds.", "TIP: Turn on the power to use perks and the Forge.", "TIP: The Mystery Box can give you the Volt Caster.", "TIP: Every 5th round the hounds come.", "TIP: In co-op, when you go down you keep shooting your pistol. That's your last stand."],
  tdm: ["TIP: 4 kills in a row = RECON DRONE. 7 = AIRSTRIKE.", "TIP: Walk over a gun you carry to take its ammo. Walk over another gun and press USE to swap.", "TIP: Bots can't see you in the corn.", "TIP: Shoot the red barrels.", "TIP: Flashlights give away where people are in the dark."],
};

function setupViews(G) {
  const locals = G.humans.filter((h) => !h.remote).sort((a, b) => a.pidx - b.pidx);
  if (G.cfg.split && locals.length > 1) App.views = [{ x0: 0, y0: 0, w: CW / 2, h: CH, players: [locals[0]] }, { x0: CW / 2, y0: 0, w: CW / 2, h: CH, players: [locals[1]] }];
  else App.views = [{ x0: 0, y0: 0, w: CW, h: CH, players: locals }];
  Input.me = locals;
  Input.n = locals.length;
  G.leashLen = 620;
}

function pauseMatch(silent) {
  if (!App.match) return;
  if (App.match.net) { if (!silent) openPauseMenu(); return; }        // online never pauses
  App.paused = true;
  SFX.suspend();
  if (!silent) openPauseMenu();
}
function resumeMatch() { closeModal(); App.paused = false; SFX.resume(); }
function openPauseMenu() {
  const online = !!(App.match && App.match.net);
  modal(`<h3>PAUSED</h3>${online ? "<p class='mute'>Online games keep running.</p>" : ""}
    <div class="acts col"><button class="btn" data-a="resume">RESUME</button><button class="btn ghost" data-a="help">HOW TO PLAY</button><button class="btn ghost" data-a="settings">SETTINGS</button><button class="btn ghost danger" data-a="quit">${App.match.mode === "zombies" ? "END GAME" : "QUIT MATCH"}</button></div>`, (box) => {
    box.querySelector('[data-a="resume"]').onclick = () => { SFX.play("click"); resumeMatch(); };
    box.querySelector('[data-a="help"]').onclick = () => openHelp(() => openPauseMenu());
    box.querySelector('[data-a="settings"]').onclick = () => openSettings(() => openPauseMenu());
    box.querySelector('[data-a="quit"]').onclick = () => { SFX.play("back"); closeModal(); App.paused = false; SFX.resume(); endMatch(true); };
  });
}

/* match over → results + XP */
function endMatch(quit) {
  const G = App.match;
  if (!G) return;
  Input.enabled = false;
  if (G.net) netLeave();
  App.match = null;
  SFX.music("over"); SFX.ambient(null);
  const sv = App.save, before = sv.xp, rankBefore = rankOf(before);
  const me = G.humans.filter((h) => !h.remote).sort((a, b) => a.pidx - b.pidx);
  let xp = 0, html = "";
  sv.stats.matches++;
  if (G.mode === "zombies") {
    const Z = G.z, round = Z.round, reached = Math.max(0, Z.phase === "break" || Z.phase === "pre" ? round : round - 1);
    const coop = G.cfg.variant === "coop" && G.humans.length > 1;
    const bestTable = coop ? sv.bestCoop : sv.best;
    const prevBest = bestTable[G.map.id] || 0;
    if (round > prevBest) bestTable[G.map.id] = round;
    for (const p of me) { xp += p.kills * XP.zKill; sv.stats.zKills += p.kills; sv.stats.crits += p.crits; }
    xp += reached * XP.zRound * (1 + reached / 20);
    sv.stats.rounds += reached;
    const all = ZM.players(G);
    html = `<div class="bigline">${quit ? "GAME ENDED" : "GAME OVER"}</div>
      <div class="sub">YOU SURVIVED <b>${round}</b> ROUND${round === 1 ? "" : "S"} · ${G.map.def.name}${round > prevBest ? ' · <span class="new">NEW BEST!</span>' : prevBest ? " · BEST " + prevBest : ""}</div>
      <table class="sb"><tr><th></th><th>POINTS</th><th>KILLS</th><th>HEADSHOTS</th><th>DOWNS</th><th>REVIVES</th></tr>
      ${all.map((p) => `<tr class="${me.includes(p) ? "me" : ""}"><td>${p.name}</td><td>${p.points.toLocaleString()}</td><td>${p.kills}</td><td>${p.crits}</td><td>${p.downs}</td><td>${p.revives}</td></tr>`).join("")}</table>
      ${G.z.versus && G.winner ? `<div class="sub">WINNER: <b>${G.winner.name}</b> (most points)</div>` : ""}`;
  } else {
    const T = G.t;
    const myTeam = me[0] ? me[0].team : 0;
    const win = G.winner === myTeam;
    if (win && !quit) sv.stats.wins++;
    for (const p of me) { xp += p.kills * XP.tKill + p.bestStreak * 0; sv.stats.tKills += p.kills; sv.stats.deaths += p.deaths; sv.stats.bestStreak = Math.max(sv.stats.bestStreak, p.bestStreak); if (p.bestStreak >= 4) xp += XP.streak; if (p.bestStreak >= 7) xp += XP.streak * 2; }
    xp += XP.tMatch + (win && !quit ? XP.tWin : 0);
    const split = G.cfg.split;
    const title = quit ? "MATCH ENDED" : G.winner === -1 ? "DRAW" : split ? (TEAM_NAME[G.winner] + " WIN") : win ? "VICTORY" : "DEFEAT";
    const team = (t) => G.actors.filter((a) => a.kind === "soldier" && a.team === t).sort((a, b) => b.kills - a.kills);
    const tbl = (t) => `<table class="sb t${t}"><tr><th>${TEAM_NAME[t]} · ${T.score[t]}</th><th>K</th><th>D</th><th>BEST STREAK</th></tr>${team(t).map((p) => `<tr class="${me.includes(p) ? "me" : ""}"><td>${p.name}${p.human ? "" : ""}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.bestStreak}</td></tr>`).join("")}</table>`;
    html = `<div class="bigline ${win || split ? "good" : "bad"}">${title}</div><div class="sub">${G.map.def.name} · ${T.score[0]} – ${T.score[1]}</div><div class="two">${tbl(0)}${tbl(1)}</div>`;
  }
  xp = Math.round(xp);
  sv.xp += xp;
  const rankAfter = rankOf(sv.xp);
  saveGame();
  // unlocks gained
  const unl = [];
  for (let r = rankBefore + 1; r <= rankAfter; r++) {
    for (const id of WEAPON_IDS) if (WEAPONS[id].rank === r) unl.push(WEAPONS[id].name);
    for (const o of OPERATORS) if (o.rank === r) unl.push("Operator " + o.name);
  }
  const a = xpForRank(rankAfter), b = xpForRank(Math.min(MAX_RANK, rankAfter + 1));
  html += `<div class="xp"><div class="xpl"><span>+${xp} XP</span><span>RANK ${rankAfter} · ${RANK_NAMES[rankAfter]}</span></div><div class="rb big"><i style="width:${rankAfter >= MAX_RANK ? 100 : Math.round(((sv.xp - a) / Math.max(1, b - a)) * 100)}%"></i></div>
    ${rankAfter > rankBefore ? `<div class="rankup">RANK UP! ${unl.length ? "UNLOCKED: " + unl.join(", ") : ""}</div>` : ""}</div>`;
  $("#res-body").innerHTML = html;
  show("scr-results");
  if (rankAfter > rankBefore) setTimeout(() => SFX.play("rankup"), 400);
  startDemo();
  setTimeout(() => { if (typeof maybeBackupReminder === "function") maybeBackupReminder(); }, 900);
}

/* ---------------- armory ---------------- */
function openArmory() {
  SFX.play("click");
  const r = myRank();
  const ops = OPERATORS.map((o) => `<div class="acard ${opUnlocked(o) ? "" : "lock"} ${App.save.op === o.id ? "sel" : ""}" data-op="${o.id}"><span class="opface">${opFaceSVG(o)}</span><b>${o.name}</b><small>${opUnlocked(o) ? o.desc : "Unlocks at rank " + o.rank}</small></div>`).join("");
  const guns = WEAPON_IDS.filter((id) => WEAPONS[id].rank < 99 || WEAPONS[id].box).map((id) => {
    const w = WEAPONS[id];
    const st = (lbl, v) => `<div class="st"><span>${lbl}</span><i><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></b></i></div>`;
    const dps = (w.dmg * (w.pellets || 1) * w.rpm) / 60;
    return `<div class="acard gunc ${w.rank < 99 && !gunUnlocked(id) ? "lock" : ""}"><b>${w.name.toUpperCase()}</b><small>${w.rank >= 99 ? "Zombies: Mystery Box only" : gunUnlocked(id) ? (w.cost ? "Wall price " + w.cost + " · " : "") + (w.box ? "In the Mystery Box" : "") : "Team Deathmatch: rank " + w.rank}</small>
      ${st("DAMAGE", (w.dmg * (w.pellets || 1)) / 150)}${st("FIRE RATE", w.rpm / 850)}${st("RANGE", w.range / 900)}${st("MOBILITY", (w.mob - 0.8) / 0.3)}${st("DPS", dps / 420)}</div>`;
  }).join("");
  $("#arm-body").innerHTML = `<h4>OPERATORS</h4><div class="agrid">${ops}</div><h4>WEAPONS</h4><div class="agrid">${guns}</div>
    <h4>SERVICE RECORD</h4><div class="rec">Rank ${r} · ${RANK_NAMES[r]} · ${App.save.xp.toLocaleString()} XP<br>Matches ${App.save.stats.matches} · Zombie kills ${App.save.stats.zKills} · TDM kills ${App.save.stats.tKills} · TDM wins ${App.save.stats.wins} · Best streak ${App.save.stats.bestStreak}<br>
    Best rounds: ${MAP_DEFS.map((d) => d.name + " " + (App.save.best[d.id] || 0) + (App.save.bestCoop[d.id] ? " (co-op " + App.save.bestCoop[d.id] + ")" : "")).join(" · ")}</div>`;
  $$("#arm-body [data-op]").forEach((el) => el.onclick = () => { const o = OPERATORS.find((x) => x.id === el.dataset.op); if (!opUnlocked(o)) { toast("RANK " + o.rank + " NEEDED"); return; } SFX.play("click"); App.save.op = o.id; saveGame(); openArmory(); });
  show("scr-armory");
}

/* ---------------- settings / help / save code ---------------- */
function openSettings(after) {
  const s = App.save.settings;
  const row = (label, key, opts) => `<div class="srow"><span>${label}</span>${seg(key, opts, String(s[key]))}</div>`;
  modal(`<h3>SETTINGS</h3>
    ${row("MUSIC", "music", [["true", "ON"], ["false", "OFF"]])}
    ${row("SOUND", "sfx", [["true", "ON"], ["false", "OFF"]])}
    ${row("STYLE", "tone", [["standard", "STANDARD"], ["gritty", "GRITTY · BLOOD"]])}
    ${row("GRAPHICS", "gfx", [["auto", "AUTO"], ["smooth", "SMOOTH"], ["sharp", "SHARP"]])}
    ${row("AIM ASSIST", "assist", [["true", "ON"], ["false", "OFF"]])}
    <p class="mute">Standard: no blood, zombies turn to ash. Gritty: blood and bodies. On iPhone, the silent switch mutes the game.</p>
    <div class="acts"><button class="btn sm ghost" data-a="code">SAVE CODE</button><button class="btn sm" data-a="ok">DONE</button></div>`, (box) => {
    box.classList.add("wide");
    box.querySelectorAll(".seg").forEach((sg) => sg.querySelectorAll("button").forEach((b) => b.onclick = () => {
      SFX.play("click");
      const k = sg.dataset.seg; let v = b.dataset.v; if (v === "true") v = true; if (v === "false") v = false;
      s[k] = v; saveGame(); applySettings();
      sg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    }));
    box.querySelector('[data-a="ok"]').onclick = () => { SFX.play("click"); closeModal(); after && after(); };
    box.querySelector('[data-a="code"]').onclick = () => openSaveCode(() => openSettings(after));
  });
}
function applySettings() {
  const s = App.save.settings;
  SFX.setMusic(s.music); SFX.setSfx(s.sfx); setTone(s.tone); viewKey = ""; resize(true);
}
function openHelp(after) {
  const touch = IS_TOUCH;
  modal(`<h3>HOW TO PLAY</h3>
    <div class="help">
      ${touch ? `<p><b>Left thumb</b>: move (the stick appears where you touch). <b>Right thumb</b>: aim. It fires while you aim; a quick tap shoots the closest enemy in front of you.</p>
      <p><b>Buttons</b> by your right thumb: ⟳ reload, ● grenade, ⚔ knife. The yellow <b>USE</b> button pops up when you can buy or do something (hold it for HOLD actions). <b>Tap the gun panel</b> at the bottom to swap weapons.</p>`
      : `<p><b>WASD</b> move · <b>mouse</b> aim · <b>click</b> fire · <b>R</b> reload · <b>F</b> / <b>E</b> use (hold for HOLD actions) · <b>G</b> or right-click grenade · <b>V</b> or Space knife · <b>Q</b> / wheel swap · <b>Esc</b> pause.</p>
      <p><b>Two on one keyboard</b>: P1 WASD + Space fire, R reload, F use, G grenade, V knife, Q swap. P2 arrows + L fire, U reload, O use, K grenade, J knife, I swap. Both aim at the nearest enemy in front.</p>`}
      <p><b>Zombies</b>: survive as many rounds as you can. Shoot for points (10 per hit, 50+ per kill). Spend them on wall guns, doors, the Mystery Box, perks (turn the <b>power</b> on first) and the <b>Forge</b> upgrade. Rebuild window boards. Grab power-ups that zombies drop.</p>
      <p><b>Team Deathmatch</b>: four against four, bots fill the gaps. First team to ${TDM.scoreLimit} kills. Kill streaks: 4 = Recon Drone, 7 = Airstrike. Enemies drop their guns.</p>
    </div>
    <div class="acts"><button class="btn sm" data-a="ok">GOT IT</button></div>`, (box) => {
    box.classList.add("wide");
    box.querySelector('[data-a="ok"]').onclick = () => { SFX.play("click"); closeModal(); after && after(); };
  });
}
function openSaveCode(after) {
  const code = encodeSave();
  modal(`<h3>SAVE CODE</h3><p>Copy this code to move your progress to another device, or paste a code here to load one.</p>
    <textarea id="sv-code">${code}</textarea>
    <div class="acts"><button class="btn sm" data-a="copy">COPY</button>${navigator.share ? `<button class="btn sm ghost" data-a="share">SHARE…</button>` : ""}<button class="btn sm ghost" data-a="load">LOAD PASTED CODE</button><button class="btn sm ghost" data-a="back">BACK</button></div>`, (box) => {
    box.classList.add("wide");
    const ta = box.querySelector("#sv-code");
    box.querySelector('[data-a="copy"]').onclick = () => { ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast("COPIED")).catch(() => { try { document.execCommand("copy"); toast("COPIED"); } catch (_) {} }); };
    const sh = box.querySelector('[data-a="share"]'); if (sh) sh.onclick = () => navigator.share({ title: "Last Stand save code", text: code }).catch(() => {});
    box.querySelector('[data-a="load"]').onclick = () => {
      const s = decodeSave(ta.value);
      if (!s) { toast("THAT CODE DIDN'T WORK"); return; }
      App.save = s; saveGame(); applySettings(); toast("PROGRESS LOADED"); renderTitle(); closeModal();
    };
    box.querySelector('[data-a="back"]').onclick = () => { closeModal(); after && after(); };
  });
}

/* ---------------- title-screen demo (a bot playing zombies behind the menu) ---------------- */
function startDemo() {
  if (App.match) return;
  const mapId = pick(MAP_DEFS).id;
  const G = newMatch({ mode: "zombies", mapId, demo: true, variant: "solo", players: [{ bot: true, op: pick(OPERATORS.slice(0, 3)).id, name: "DEMO" }] });
  const bot = G.actors[0]; bot.bot.skill = 0.9; bot.points = 6000; bot.weapons = [newSlot("r4"), newSlot("p9")]; bot.hp = bot.maxHp = 400; G.godMode = true; bot.human = false;
  G.z.power = true;
  initRender(G);
  App.demo = G;
  App.demoViews = [{ x0: 0, y0: 0, w: CW, h: CH, players: [bot] }];
}
function stopDemo() { App.demo = null; }

/* ---------------- wiring ---------------- */
function wireMenus() {
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    switch (a) {
      case "zombies": openSetup("zombies"); break;
      case "tdm": openSetup("tdm"); break;
      case "armory": openArmory(); break;
      case "settings": SFX.play("click"); openSettings(); break;
      case "help": SFX.play("click"); openHelp(); break;
      case "back": SFX.play("back"); renderTitle(); break;
      case "again": SFX.play("click"); if (App.lastCfg && App.lastCfg.online) { renderTitle(); openSetup(App.lastCfg.mode); } else if (App.lastCfg) startMatch(Object.assign({}, App.lastCfg, { seed: (Math.random() * 1e9) | 0 })); break;
      case "menu": SFX.play("back"); renderTitle(); break;
    }
  });
  $("#setup-go").onclick = setupGo;
}
