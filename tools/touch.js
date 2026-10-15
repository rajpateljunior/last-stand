// Touch + mouse control test: real input events, not function calls.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // --- touch (iPhone landscape)
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(2000);
  const fresh = await p.evaluate(() => ({ modal: !document.querySelector('#modal').classList.contains('hidden'), screen: App.screen }));
  console.log('fresh start', JSON.stringify(fresh));
  await p.tap('[data-act="zombies"]'); await p.waitForTimeout(300);
  await p.tap('#setup-go'); await p.waitForTimeout(2500);
  const help = await p.evaluate(() => !document.querySelector('#modal').classList.contains('hidden') && App.paused);
  console.log('first match shows HOW TO PLAY and pauses:', help);
  await p.tap('#modal [data-a="ok"]'); await p.waitForTimeout(300);
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const before = await p.evaluate(() => { const a = App.match.humans[0]; return [a.x, a.y, a.stats.shots]; });
  // left thumb drags right, right thumb drags up (aim + fire)
  await touch('touchStart', [[120, 300], [700, 300]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[120 + k * 5, 300], [700, 300 - k * 4]]); await p.waitForTimeout(40); }
  await p.waitForTimeout(900);
  const mid = await p.evaluate(() => { const a = App.match.humans[0]; return [a.x, a.y, a.stats.shots, +a.ang.toFixed(2), Input.aimActive[0]]; });
  await touch('touchEnd', []);
  console.log('touch: moved', Math.round(mid[0] - before[0]), 'px right; shots', mid[2] - before[2], '; aim', mid[3], '(≈ -1.57 = up)', 'aiming', mid[4]);
  // USE button: stand at the Marksman wall gun and tap the yellow button
  await p.evaluate(() => { const a = App.match.humans[0]; a.x = 26.5 * 40; a.y = 17.5 * 40; a.points = 2000; });
  await p.waitForTimeout(300);
  const ub = await p.evaluate(() => { const b = Input.layout.players[0].use; return [b.x, b.y, Input.players[0].useShown]; });
  await touch('touchStart', [[ub[0], ub[1]]]); await p.waitForTimeout(80); await touch('touchEnd', []); await p.waitForTimeout(200);
  console.log('USE button shown', ub[2], '→ bought:', await p.evaluate(() => App.match.humans[0].weapons.map((w) => w.id).join(',')));
  // tap the gun panel to swap
  const hb = await p.evaluate(() => { const h = App.match.humans[0].hudBox; return [h.x + h.w / 2, h.y + h.h / 2, App.match.humans[0].cur]; });
  await touch('touchStart', [[hb[0], hb[1]]]); await p.waitForTimeout(80); await touch('touchEnd', []); await p.waitForTimeout(200);
  console.log('swap by tapping panel:', hb[2], '→', await p.evaluate(() => App.match.humans[0].cur));
  // pause button
  const pz = await p.evaluate(() => [Input.layout.pause.x, Input.layout.pause.y]);
  await touch('touchStart', [[pz[0], pz[1]]]); await touch('touchEnd', []); await p.waitForTimeout(200);
  console.log('pause:', await p.evaluate(() => App.paused));
  // rotate to portrait
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(800);
  console.log('portrait view', await p.evaluate(() => [CW, CH, App.views[0].w, App.views[0].h].join('x')));
  await ctx.close();
  // --- mouse + keyboard (desktop)
  const c2 = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const q = await c2.newPage(); q.on('pageerror', (e) => errs.push(e.message));
  await q.addInitScript(() => localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true })));
  await q.goto('http://localhost:8765/index.html'); await q.waitForTimeout(1500);
  await q.click('[data-act="tdm"]'); await q.click('#setup-go'); await q.waitForTimeout(2500);
  const b0 = await q.evaluate(() => { const a = App.match.humans[0]; return [a.x, a.y, a.stats.shots]; });
  await q.keyboard.down('KeyD'); await q.mouse.move(640, 100); await q.mouse.down(); await q.waitForTimeout(800); await q.mouse.up(); await q.keyboard.up('KeyD');
  const b1 = await q.evaluate(() => { const a = App.match.humans[0]; return [a.x, a.y, a.stats.shots, +a.ang.toFixed(2)]; });
  console.log('desktop: moved', Math.round(b1[0] - b0[0]), 'px right; shots', b1[2] - b0[2], '; aim', b1[3]);
  await q.keyboard.press('KeyQ'); await q.waitForTimeout(450);
  console.log('Q swaps to', await q.evaluate(() => curSlot(App.match.humans[0]).id));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
