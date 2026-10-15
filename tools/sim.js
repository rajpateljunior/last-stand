// Balance + soak test, no rendering. Zombies: a bot plays solo on each map and we record how far it gets.
// TDM: eight bots play a full match on each map. Usage: node tools/sim.js [zombies|tdm|all] [runs]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const which = process.argv[2] || 'all', runs = +(process.argv[3] || 2);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 800, height: 400 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await p.addInitScript(() => { localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true })); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(() => { stopDemo(); App.demo = null; });
  if (which === 'zombies' || which === 'all') for (const map of ['outpost', 'downtown', 'farm']) for (let r = 0; r < runs; r++) {
    const res = await p.evaluate(async (map) => {
      const G = newMatch({ mode: 'zombies', mapId: map, variant: 'solo', players: [{ bot: true, op: 'hawk', name: 'SIM' }] });
      const a = G.actors[0]; a.bot.skill = 0.8;
      const log = []; let lastRound = 0, t0 = performance.now();
      for (let k = 0; k < 60 * 60 * 45 && !G.over; k++) {
        stepMatch(G, [], STEP); G.vev.length = 0;
        if (G.z.round !== lastRound) { lastRound = G.z.round; log.push([G.z.round, Math.round(G.time), a.points, a.weapons.map((w) => w.id + (w.up ? '+' : '')).join('/'), a.perks.join(','), G.map.doors.filter((d) => d.open).length, G.z.power ? 'P' : '-']); }
        if (G.z.round > 30) break;
      }
      return { map, round: G.z.round, time: Math.round(G.time), kills: a.kills, downs: a.downs, ms: Math.round(performance.now() - t0), log: log.slice(-8) };
    }, map);
    console.log('ZOMBIES', JSON.stringify(res));
  }
  // combat-only check: the bot gets a typical loadout for each round (no shopping) — how far can it get?
  if (which === 'zcombat') for (const map of ['outpost', 'downtown', 'farm']) for (let r = 0; r < runs; r++) {
    const res = await p.evaluate(async (map) => {
      const G = newMatch({ mode: 'zombies', mapId: map, variant: 'solo', players: [{ bot: true, op: 'hawk', name: 'SIM' }] });
      const a = G.actors[0]; a.bot.skill = 0.7; a.bot.noShop = true;
      for (const d of G.map.doors) ZM.openDoor(G, d); G.z.power = true;
      const plan = (rd) => rd <= 2 ? [['p9'], []] : rd <= 5 ? [['dmr', 'p9'], []] : rd <= 8 ? [['r4', 'dmr'], ['iron']] : rd <= 12 ? [['k74', 'hammer'], ['iron', 'rapid', 'quick']] : [['hammer+', 'k74+'], ['iron', 'rapid', 'quick', 'swift']];
      let lastRound = 0, hpLost = {};
      for (let k = 0; k < 60 * 60 * 60 && !G.over; k++) {
        stepMatch(G, [], STEP);
        for (const e of G.vev) if (e.k === 'hurt') hpLost[G.z.round] = (hpLost[G.z.round] || 0) + Math.round(e.amt);
        G.vev.length = 0;
        if (G.z.round !== lastRound) {
          lastRound = G.z.round; const [ws, pk] = plan(lastRound);
          a.weapons = ws.map((w) => newSlot(w.replace('+', ''), w.endsWith('+'))); a.cur = 0; a.perks = pk.slice(); a.maxHp = pk.includes('iron') ? 250 : 150;
        }
        if (G.z.round > 30) break;
      }
      return { map, round: G.z.round, time: Math.round(G.time), kills: a.kills, hpLost };
    }, map);
    console.log('ZCOMBAT', JSON.stringify(res));
  }
  if (which === 'tdm' || which === 'all') for (const map of ['outpost', 'downtown', 'farm']) {
    const res = await p.evaluate(async (map) => {
      const G = newMatch({ mode: 'tdm', mapId: map, diff: 'regular', players: [] });
      const stuck = {}; const last = {};
      for (let k = 0; k < 60 * 60 * 7 && !G.over; k++) {
        stepMatch(G, [], STEP); G.vev.length = 0;
        if (k % 120 === 0) for (const a of G.actors) { if (!a.alive) continue; const l = last[a.id]; if (l && Math.hypot(a.x - l[0], a.y - l[1]) < 8 && !a.bot.target) stuck[a.name] = (stuck[a.name] || 0) + 1; last[a.id] = [a.x, a.y]; }
      }
      return { map, time: Math.round(G.time), score: G.t.score, winner: G.winner, kd: G.actors.map((a) => a.name + ' ' + a.kills + '/' + a.deaths + ' ' + a.weapons[0].id).join(', '), stuck };
    }, map);
    console.log('TDM', JSON.stringify(res));
  }
  console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors');
  await b.close();
})();
