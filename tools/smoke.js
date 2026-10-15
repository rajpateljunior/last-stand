// Smoke test: load the game, check for errors, start each mode, take screenshots.
// Usage: node tools/smoke.js <outdir> [w h]   (serve the folder first: python3 -m http.server 8765)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const out = process.argv[2] || '/tmp';
const W = +(process.argv[3] || 844), H = +(process.argv[4] || 390);
const touch = process.argv.includes('touch');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('PAGE ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => { localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true })); });
  await p.goto('http://localhost:8765/index.html');
  await p.waitForTimeout(2500);
  await p.screenshot({ path: out + '/title.png' });
  for (const [mode, map] of [['zombies', 'outpost'], ['tdm', 'downtown'], ['zombies', 'farm']]) {
    await p.evaluate(([mode, map]) => { openSetup(mode); App.setup.map = map; renderSetup(); }, [mode, map]);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out + `/setup-${mode}.png` });
    await p.evaluate(() => setupGo());
    await p.waitForTimeout(3500);
    await p.screenshot({ path: out + `/play-${mode}-${map}.png` });
    const st = await p.evaluate(() => { const G = App.match; return G ? { mode: G.mode, actors: G.actors.length, time: G.time.toFixed(1), round: G.z && G.z.round, score: G.t && G.t.score } : null; });
    console.log(mode, map, JSON.stringify(st));
    await p.evaluate(() => endMatch(true));
    await p.waitForTimeout(500);
  }
  await p.screenshot({ path: out + '/results.png' });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
