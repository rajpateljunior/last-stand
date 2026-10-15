// Offline test: load once (the service worker caches everything), go offline, reload, play a round.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { if (!localStorage.getItem('last-stand-save-v1')) localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true })); });
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2500);
  const n = await p.evaluate(async () => { await navigator.serviceWorker.ready; const ks = await caches.keys(); const c = await caches.open(ks[0]); return ks[0] + ' files=' + (await c.keys()).length; });
  console.log('cache', n);
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(2500);
  const ok = await p.evaluate(async () => {
    await startMatch({ mode: 'zombies', mapId: 'farm', variant: 'solo', players: [{ pidx: 0, op: 'hawk', name: 'YOU' }] });
    await new Promise((r) => setTimeout(r, 3000));
    return { playing: !!App.match, t: App.match.time.toFixed(1), font: document.fonts.check("20px 'Black Ops One'"), peer: !!document.querySelector('script[src="peerjs.min.js"]') || 'not needed offline' };
  });
  console.log('offline', JSON.stringify(ok));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
