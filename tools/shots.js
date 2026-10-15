// Gameplay screenshots: a bot plays for you for N seconds, then we take a picture.
// node tools/shots.js <outdir> <w> <h> <zombies|tdm> <map> <seconds> [gritty] [touch] [coop|split]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const [out, W, H, mode, map, secs] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5], process.argv[6], +process.argv[7]];
const flags = process.argv.slice(8);
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const touch = flags.includes('touch');
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.addInitScript((tone) => { localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true, xp: 99999, settings: { tone } })); }, flags.includes('gritty') ? 'gritty' : 'standard');
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  await p.evaluate(([mode, map, flags]) => {
    const two = flags.includes('coop') || flags.includes('split');
    const players = [{ pidx: 0, op: 'hawk', name: 'P1', team: 0, loadout: { p: 'r4', s: 'p9' } }];
    if (two) players.push({ pidx: 1, op: 'nova', name: 'P2', team: flags.includes('split') ? 1 : 0, loadout: { p: 'mx5', s: 'p9' } });
    startMatch({ mode, mapId: map, variant: two ? (flags.includes('split') ? 'versus' : 'coop') : 'solo', diff: 'regular', players, sameScreen: two, split: flags.includes('split'), seed: 5 });
  }, [mode, map, flags]);
  await p.waitForTimeout(800);
  // the bot drives the local players
  await p.evaluate(([mode]) => {
    for (const h of App.match.humans) h.bot = mode === 'zombies' ? { zombieBot: true, skill: 0.85, t: 0 } : { diff: DIFF.regular, t: 0, aimErr: 0 };
    window.readPlayer = (i, G, me) => { const o = botThink(G, me, STEP); if (o.aim !== undefined && o.aim !== null && G.mode === 'zombies') {} return o; };
    if (mode === 'zombies') { const G = App.match; for (const h of G.humans) { h.points = 30000; } }
  }, [mode]);
  // fast-forward in real time-ish (sim steps) then let it render a few frames
  await p.evaluate(async (secs) => { const G = App.match; for (let k = 0; k < secs * 60; k++) { const inp = []; for (const me of Input.me) inp[me.pidx] = readPlayer(me.pidx, G, me); stepMatch(G, inp, STEP); runSimTimers(G); consumeEvents(G, App.views); if (k % 4 === 0) stepParticles(G, STEP * 4); } }, secs);
  await p.waitForTimeout(1200);
  const tag = [mode, map, W + 'x' + H, ...flags].join('-');
  await p.screenshot({ path: `${out}/g-${tag}.png` });
  console.log(tag, JSON.stringify(await p.evaluate(() => { const G = App.match; return { round: G.z && G.z.round, score: G.t && G.t.score, zombies: G.actors.filter((a) => a.kind === 'zombie' && a.alive).length, fps: (perf.n / Math.max(0.01, perf.acc)).toFixed(0) }; })));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
