// Online test: two browsers play together through a local PeerServer.
// Start one first:  node -e "require('/tmp/peersrv/node_modules/peer').PeerServer({ port: 9000, path: '/' })" &
// Then: node tools/online.js <outdir> [zombies|tdm]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const URL = 'http://localhost:8765/index.html?peerhost=127.0.0.1&peerport=9000';
const out = process.argv[2] || '/tmp', mode = process.argv[3] || 'zombies';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const mk = async () => { const c = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }); const p = await c.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message + ' ' + (e.stack || '').split('\n')[1])); await p.addInitScript(() => localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true, xp: 99999 }))); await p.goto(URL); await p.waitForTimeout(1500); return p; };
  const H = await mk(), Gp = await mk();
  const auto = (mode) => {
    window.readPlayer = (i, G, me) => { if (!me.bot) me.bot = mode === 'zombies' ? { zombieBot: true, skill: 0.9, t: 0, noShop: true } : { diff: DIFF.veteran, t: 0, aimErr: 0 }; return Object.assign({}, botThink(G, me, STEP)); };
  };
  await H.evaluate(auto, mode); await Gp.evaluate(auto, mode);
  await H.evaluate((mode) => { openSetup(mode); App.setup.players = 'online'; App.setup.map = mode === 'zombies' ? 'outpost' : 'downtown'; App.setup.variant = mode === 'tdm' ? 'versus' : 'coop'; netHost(); }, mode);
  await H.waitForFunction(() => App.net && App.net.peer && App.net.peer.open, null, { timeout: 15000 });
  const code = await H.evaluate(() => App.net.code);
  console.log('room', code);
  await Gp.evaluate((code) => { netJoin(code); }, code);
  await H.waitForFunction(() => App.match && !App.match.hold, null, { timeout: 30000 });
  await Gp.waitForFunction(() => App.match && App.match.me, null, { timeout: 30000 });
  console.log('both playing');
  await H.waitForTimeout(14000);
  const snap = (p) => p.evaluate(() => { const G = App.match; const me = Input.me[0]; return { role: G.net && G.net.role, me: me && [Math.round(me.x), Math.round(me.y), me.hp, me.points, me.kills], actors: G.actors.length, zombies: G.actors.filter((a) => a.kind === 'zombie' && a.alive).length, round: G.z && G.z.round, score: G.t && G.t.score, others: G.actors.filter((a) => a.kind === 'soldier' && a !== me).map((a) => a.name + '@' + Math.round(a.x) + ',' + Math.round(a.y) + ' k' + a.kills).slice(0, 4) }; });
  console.log('HOST ', JSON.stringify(await snap(H)));
  console.log('GUEST', JSON.stringify(await snap(Gp)));
  // the guest's position as the host sees it vs the guest's own
  const gpos = await Gp.evaluate(() => [Math.round(App.match.me.x), Math.round(App.match.me.y)]);
  const hview = await H.evaluate(() => { const g = App.match.actors.find((a) => a.remote); return [Math.round(g.x), Math.round(g.y), g.kills, g.points]; });
  console.log('guest pos (guest/host view)', JSON.stringify(gpos), JSON.stringify(hview));
  if (mode === 'zombies') {
    // guest buys a door: give points on the host, walk the guest next to the bunker's west door, press USE
    await H.evaluate(() => { const g = App.match.actors.find((a) => a.remote); g.points = 5000; });
    await Gp.evaluate(() => { const me = App.match.me; me.bot = null; me.x = 26.5 * 40; me.y = 19.5 * 40; window.readPlayer = (i, G, m) => ({ mx: 0, my: 0, aim: Math.PI, use: Math.random() < 0.2 }); });
    await H.waitForTimeout(2500);
    const door = await H.evaluate(() => { const d = App.match.map.doors.find((d) => d.cx < 26 * 40 && Math.abs(d.cy - 20 * 40) < 60); return { open: d.open, pts: App.match.actors.find((a) => a.remote).points }; });
    const gdoor = await Gp.evaluate(() => { const d = App.match.map.doors.find((d) => d.cx < 26 * 40 && Math.abs(d.cy - 20 * 40) < 60); return d.open; });
    console.log('guest bought door → host', JSON.stringify(door), 'guest sees open', gdoor);
  }
  await H.screenshot({ path: out + '/online-host-' + mode + '.png' }); await Gp.screenshot({ path: out + '/online-guest-' + mode + '.png' });
  await Gp.evaluate(() => endMatch(true));
  await H.waitForTimeout(1500);
  console.log('after guest left', JSON.stringify(await H.evaluate(() => ({ playing: !!App.match, net: !!(App.match && App.match.net), friend: App.match && App.match.actors.filter((a) => a.kind === 'soldier').map((a) => a.name + (a.alive ? '' : ' (dead)')).join(', ') }))));
  console.log('host errs', H.errs.join(' | ') || 'none'); console.log('guest errs', Gp.errs.join(' | ') || 'none');
  await b.close();
})();
