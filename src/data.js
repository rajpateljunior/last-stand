/* Game data: weapons, perks, enemies, power-ups, ranks, operators. Every number here is a tuning knob. */

/* WEAPONS
   dmg      damage per bullet in Team Deathmatch (players have 100 HP there)
   zdmg     damage per bullet against zombies (defaults to dmg * ZMUL). Zombie HP grows every round.
   rpm      rounds per minute; auto = keeps firing while you hold the trigger (semi-autos fire at their max rate too)
   mag/res  magazine size / reserve ammo; reload in seconds
   range    full damage out to this distance (world units; one map tile = 40), then falls to `falloff` × damage
   spread   bullet cone (radians, ± half), kick adds spread per shot while firing
   mob      movement speed multiplier while carrying it
   pierce   how many enemies one bullet can pass through
   crit     chance of a critical (head) shot: ×2 damage, extra points against zombies
   cost     wall-buy price (zombies), 0 = not on walls. box = weight in the mystery box (0 = never)
   rank     Team Deathmatch loadout unlock rank. slot "p" primary, "s" secondary
   cls      sound + look family. up = the Forge-upgraded version (zombies only) */
const ZMUL = 3.5;
const WEAPONS = {
  p9:      { name: "P9 Pistol", cls: "pistol", slot: "s", dmg: 28, zdmg: 60, rpm: 380, auto: false, mag: 12, res: 72, reload: 1.35, range: 420, falloff: 0.65, spread: 0.035, kick: 0.012, mob: 1.0, pierce: 1, crit: 0.15, cost: 0, box: 0, rank: 1,
             up: { name: "Hellfire P9", zdmg: 260, mag: 16, res: 160, boom: 46, col: "#ff7a2a" } },
  magnum:  { name: ".44 Magnum", cls: "magnum", slot: "s", dmg: 75, rpm: 150, auto: false, mag: 6, res: 48, reload: 2.1, range: 520, falloff: 0.75, spread: 0.02, kick: 0.05, mob: 1.0, pierce: 2, crit: 0.25, cost: 0, box: 3, rank: 9,
             up: { name: "Judgment .44", zdmg: 900, mag: 8, res: 96, col: "#ffd23f" } },
  mx5:     { name: "MX5 SMG", cls: "smg", slot: "p", dmg: 24, rpm: 820, auto: true, mag: 32, res: 192, reload: 1.75, range: 300, falloff: 0.55, spread: 0.07, kick: 0.006, mob: 1.06, pierce: 1, crit: 0.1, cost: 1000, box: 4, rank: 1,
             up: { name: "MX5 Reaper", zdmg: 190, mag: 48, res: 336, col: "#7affb4" } },
  r4:      { name: "R4 Carbine", cls: "rifle", slot: "p", dmg: 27, rpm: 720, auto: true, mag: 30, res: 180, reload: 2.0, range: 520, falloff: 0.72, spread: 0.045, kick: 0.005, mob: 0.98, pierce: 1, crit: 0.12, cost: 1200, box: 4, rank: 2,
             up: { name: "R4 Valkyrie", zdmg: 220, mag: 45, res: 315, col: "#6fd6ff" } },
  k74:     { name: "K-74 Rifle", cls: "ak", slot: "p", dmg: 34, rpm: 600, auto: true, mag: 30, res: 180, reload: 2.25, range: 560, falloff: 0.72, spread: 0.06, kick: 0.007, mob: 0.95, pierce: 1, crit: 0.12, cost: 1400, box: 4, rank: 4,
             up: { name: "K-74 Wolfsbane", zdmg: 270, mag: 45, res: 315, col: "#c38bff" } },
  sg12:    { name: "SG-12 Pump", cls: "shotgun", slot: "p", dmg: 19, pellets: 8, rpm: 72, auto: false, mag: 6, res: 48, reload: 2.5, range: 170, falloff: 0.3, spread: 0.19, kick: 0.0, mob: 0.96, pierce: 1, crit: 0, cost: 600, box: 3, rank: 6,
             up: { name: "SG-12 Cerberus", zdmg: 200, mag: 10, res: 90, col: "#ff5a5a" } },
  sweeper: { name: "Sweeper Auto-12", cls: "shotgun", slot: "p", dmg: 15, pellets: 7, rpm: 230, auto: true, mag: 10, res: 60, reload: 2.7, range: 150, falloff: 0.3, spread: 0.22, kick: 0.01, mob: 0.93, pierce: 1, crit: 0, cost: 0, box: 3, rank: 17,
             up: { name: "Typhoon-12", zdmg: 160, mag: 20, res: 120, col: "#ff9a3a" } },
  dmr:     { name: "Marksman DMR", cls: "dmr", slot: "p", dmg: 60, rpm: 330, auto: false, mag: 12, res: 96, reload: 2.3, range: 820, falloff: 0.9, spread: 0.012, kick: 0.02, mob: 0.94, pierce: 2, crit: 0.3, cost: 500, box: 2, rank: 8,
             up: { name: "Deadeye DMR", zdmg: 520, mag: 20, res: 180, col: "#9ff0ff" } },
  hammer:  { name: "Hammer LMG", cls: "lmg", slot: "p", dmg: 32, rpm: 650, auto: true, mag: 100, res: 300, reload: 4.2, range: 560, falloff: 0.72, spread: 0.08, kick: 0.004, mob: 0.85, pierce: 2, crit: 0.1, cost: 1750, box: 4, rank: 11,
             up: { name: "Warhammer", zdmg: 260, mag: 150, res: 600, col: "#ffcf3a" } },
  longbow: { name: "Longbow Sniper", cls: "sniper", slot: "p", dmg: 140, rpm: 48, auto: false, mag: 5, res: 40, reload: 3.0, range: 1500, falloff: 1, spread: 0.004, kick: 0.0, mob: 0.88, pierce: 5, crit: 0.5, cost: 0, box: 3, rank: 14, moveSpread: 0.07,
             up: { name: "Widowmaker", zdmg: 4200, mag: 8, res: 80, col: "#ff4dd2" } },
  thumper: { name: "Thumper Launcher", cls: "launcher", slot: "p", dmg: 150, rpm: 70, auto: false, mag: 6, res: 24, reload: 3.4, range: 900, falloff: 1, spread: 0.02, kick: 0, mob: 0.9, pierce: 1, crit: 0, cost: 0, box: 2, rank: 20, explosive: { r: 120, zdmg: 1100, speed: 760 },
             up: { name: "Thunder Drum", zdmg: 3000, mag: 10, res: 50, col: "#ff6a2a" } },
  volt:    { name: "Volt Caster", cls: "volt", slot: "p", dmg: 999, zdmg: 99999, rpm: 90, auto: false, mag: 4, res: 24, reload: 2.8, range: 900, falloff: 1, spread: 0, kick: 0, mob: 1.0, pierce: 1, crit: 0, cost: 0, box: 1, rank: 99, chains: 5, zombiesOnly: true,
             up: { name: "Storm Caster", mag: 8, res: 56, chains: 10, col: "#7ad7ff" } },
};
const WEAPON_IDS = Object.keys(WEAPONS);
for (const id of WEAPON_IDS) { const w = WEAPONS[id]; w.id = id; if (!w.zdmg) w.zdmg = w.dmg * ZMUL; }
const KNIFE = { zdmg: 150, dmg: 100, range: 64, arc: 1.25, cd: 0.55, lunge: 90 };
const FRAG = { fuse: 1.7, r: 150, dmg: 160, zdmg: 1200, speed: 520, max: 4 };

/* PERKS (zombies). power: needs the power switch on first. */
const PERKS = {
  iron:  { name: "IRONHIDE", desc: "Take more hits: 250 health", cost: 2500, col: "#d6332f", power: true },
  quick: { name: "QUICKHANDS", desc: "Reload twice as fast", cost: 3000, col: "#2fb35a", power: true },
  rapid: { name: "RAPID FIRE", desc: "Shoot 33% faster", cost: 2000, col: "#e8a32a", power: true },
  wind:  { name: "SECOND WIND", desc: "Solo: get back up when you go down (3 uses). Co-op: revive twice as fast", cost: 1500, soloCost: 500, col: "#3a8bff", power: false },
  swift: { name: "SWIFT BOOTS", desc: "Move 15% faster", cost: 2000, col: "#b56bff", power: true },
};
const PERK_IDS = Object.keys(PERKS);
const MAX_PERKS = 4;

/* ZOMBIE TYPES. hp is a multiple of the round's base health (see zombieHp). spd in units/second (players ~170). */
const ZTYPES = {
  walker:  { hp: 1, r: 13, dmg: 50, reach: 32, windup: 0.5, cd: 1.1, pts: 50 },
  soldier: { hp: 1.45, r: 14, dmg: 50, reach: 32, windup: 0.5, cd: 1.1, pts: 70, drop: 0.4 },
  exploder:{ hp: 0.75, r: 16, dmg: 0, reach: 40, windup: 0.6, cd: 2, pts: 80, boom: { r: 105, pdmg: 60, zdmg: 900 } },
  brute:   { hp: 6, r: 17, draw: 23, dmg: 90, reach: 42, windup: 0.6, cd: 1.6, pts: 300, charge: 330 },
  hound:   { hp: 0.4, r: 12, dmg: 25, reach: 30, windup: 0.32, cd: 1.0, pts: 60 },
};
function zombieHp(round) { return round <= 9 ? 100 + 80 * (round - 1) : 740 * Math.pow(1.1, round - 9); }
// zombies per round (1 player). Co-op ×1.6. On screen at once is capped (ZCAP) so phones stay smooth.
function zombieCount(round, players) { return Math.floor((players > 1 ? 1.6 : 1) * (4 + 2.2 * round + 0.06 * round * round)); }
const ZCAP = 20;            // solo; co-op allows 26
const HOUND_EVERY = 5;           // every 5th round is a hound round
const POINTS = { hit: 10, kill: 50, crit: 100, knife: 130, board: 10, boardMax: 500, revive: 100, nuke: 400, start: 500 };
const BOX_COST = 950, FORGE_COST = 5000, FIRESALE_BOX = 10;

/* POWER-UPS dropped by zombies */
const POWERUPS = {
  ammo:   { name: "MAX AMMO", col: "#7cff5a", w: 22 },
  double: { name: "DOUBLE POINTS", col: "#ffd23f", w: 25, t: 30 },
  insta:  { name: "INSTA-KILL", col: "#ff5a5a", w: 22, t: 30 },
  nuke:   { name: "NUKE", col: "#ffffff", w: 13 },
  barrier:{ name: "BARRIER", col: "#5ad1ff", w: 10 },
  sale:   { name: "FIRE SALE", col: "#ff8a1c", w: 8, t: 30 },
};
const DROP = { chance: 0.026, maxPerRound: 4, gap: 7 };

/* TEAM DEATHMATCH */
const TDM = { size: 4, scoreLimit: 40, time: 360, respawn: 3, protect: 2, hp: 100, regenDelay: 4.5, regenRate: 40 };
const STREAKS = [
  { id: "recon", kills: 4, name: "RECON DRONE", desc: "Shows every enemy on your map for 30 s", t: 30 },
  { id: "air", kills: 7, name: "AIRSTRIKE", desc: "Shells rain down on the enemy", t: 0 },
];
const BOT_NAMES = ["Kowalski", "Reyes", "Mako", "Tank", "Doc", "Sparks", "Ghost", "Rook", "Bishop", "Havoc", "Vega", "Ozzy", "Jinx", "Talon", "Brick", "Rio",
  "Nomad", "Viper", "Mason", "Sully", "Kilo", "Fox", "Duke", "Patch", "Spike", "Moose", "Dutch", "Raven", "Zulu", "Cobra"];
const DIFF = {
  recruit: { name: "RECRUIT", react: 0.75, aimErr: 0.19, burst: 0.32, track: 3.0, hpMul: 1 },
  regular: { name: "REGULAR", react: 0.5, aimErr: 0.12, burst: 0.5, track: 4.2, hpMul: 1 },
  veteran: { name: "VETERAN", react: 0.27, aimErr: 0.065, burst: 0.8, track: 6.5, hpMul: 1 },
};

/* OPERATORS (looks only). rank = unlock rank. */
const OPERATORS = [
  { id: "hawk", name: "HAWK", desc: "Squad leader. Helmet, olive fatigues.", head: "helmet", skin: "#c99b77", cloth: "#4f5a3a", vest: "#3a4130", accent: "#c8a24a", rank: 1 },
  { id: "nova", name: "NOVA", desc: "Combat medic. Ponytail, field cap.", head: "ponytail", skin: "#e2b493", cloth: "#5b6470", vest: "#363c45", accent: "#e05a5a", hair: "#3b2416", rank: 1 },
  { id: "ranger", name: "RANGER", desc: "Scout. Boonie hat, desert camo.", head: "boonie", skin: "#8d5f3e", cloth: "#9a8460", vest: "#6d5e44", accent: "#e0c070", rank: 1 },
  { id: "viper", name: "VIPER", desc: "Night ops. Balaclava, all black.", head: "balaclava", skin: "#2a2a2c", cloth: "#232427", vest: "#17181a", accent: "#7aff7a", rank: 5 },
  { id: "bishop", name: "BISHOP", desc: "Comms. Headset and backwards cap.", head: "cap", skin: "#5a3a26", cloth: "#3e4a5c", vest: "#2c3442", accent: "#5ad1ff", hair: "#111", rank: 10 },
  { id: "wraith", name: "WRAITH", desc: "Legend. Skull mask, hood.", head: "skull", skin: "#d8d2c4", cloth: "#2d2b2a", vest: "#1d1c1b", accent: "#ff3b3b", rank: 15 },
];
const TEAM_COL = ["#3d8bff", "#ff4a3d"];
const TEAM_NAME = ["TASK FORCE", "VULTURES"];

/* RANKS: XP needed for each rank (cumulative). */
const RANK_NAMES = ["", "PRIVATE", "PRIVATE II", "PRIVATE FIRST CLASS", "LANCE CORPORAL", "CORPORAL", "CORPORAL II", "SERGEANT", "SERGEANT II", "STAFF SERGEANT", "GUNNERY SERGEANT",
  "MASTER SERGEANT", "FIRST SERGEANT", "SERGEANT MAJOR", "WARRANT OFFICER", "SECOND LIEUTENANT", "FIRST LIEUTENANT", "CAPTAIN", "CAPTAIN II", "MAJOR", "MAJOR II",
  "LIEUTENANT COLONEL", "COLONEL", "COLONEL II", "BRIGADIER GENERAL", "MAJOR GENERAL", "LIEUTENANT GENERAL", "GENERAL", "GENERAL II", "GENERAL III", "COMMANDER"];
const MAX_RANK = RANK_NAMES.length - 1;
function xpForRank(r) { return r <= 1 ? 0 : Math.round(350 * (r - 1) + 45 * (r - 1) * (r - 1)); }
function rankOf(xp) { let r = 1; while (r < MAX_RANK && xp >= xpForRank(r + 1)) r++; return r; }
const XP = { zKill: 10, zRound: 60, tKill: 50, tWin: 250, tMatch: 100, streak: 75 };
