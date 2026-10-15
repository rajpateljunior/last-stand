// Feature test: drives the game's rules directly and checks each one does what it should.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await p.addInitScript(() => localStorage.setItem('last-stand-save-v1', JSON.stringify({ v: 1, seenHelp: true })));
  await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1500);
  const res = await p.evaluate(() => {
    stopDemo();
    const out = {}; const ok = (k, v) => (out[k] = v ? 'OK' : 'FAIL');
    const run = (G, sec, inp) => { for (let k = 0; k < sec * 60; k++) { stepMatch(G, inp ? [inp()] : [], STEP); G.vev.length = 0; } };
    const at = (G, a, x, y) => { a.x = (x + 0.5) * TILE; a.y = (y + 0.5) * TILE; a.vx = a.vy = 0; };
    const press = (G, a) => { stepMatch(G, [{ use: true }], STEP); G.vev.length = 0; };
    const hold = (G, a, s) => { for (let k = 0; k < s * 60; k++) { stepMatch(G, [{ useHold: true }], STEP); G.vev.length = 0; } };
    // ---------- zombies (Outpost) ----------
    let G = newMatch({ mode: 'zombies', mapId: 'outpost', variant: 'solo', players: [{ pidx: 0, op: 'hawk', name: 'T' }] });
    const a = G.humans[0]; a.points = 100000; G.godMode = true;
    // wall gun: Marksman DMR at (26,17) in the bunker
    at(G, a, 26, 17); press(G, a); ok('wallbuy', a.weapons.some((w) => w.id === 'dmr'));
    const pts0 = a.points; press(G, a); ok('wallbuy-ammo-full-refused', a.points === pts0);
    // door: bunker west door at (25,19) → stand at (26,19)
    at(G, a, 26, 19); press(G, a); const west = G.map.doors.find((d) => d.cells.some(([x, y]) => x === 25 && y === 19));
    ok('door-open', west.open && G.z.open.has(west.sides.find((s) => s !== G.map.startArea)));
    // mystery box in the bunker (31,16) → stand at (31,17)
    at(G, a, 31, 17); press(G, a); ok('box-spin', G.z.box.state === 'spin');
    run(G, 3.8); const offered = G.z.box.state === 'offer' || G.z.box.state === 'skull'; ok('box-offer', offered);
    if (G.z.box.state === 'offer') { const wid = G.z.box.wid; press(G, a); ok('box-take', a.weapons.some((w) => w.id === wid)); }
    // perk needs power: Ironhide in barracks (4,4) → stand (5,4)
    at(G, a, 5, 4); press(G, a); ok('perk-needs-power', !a.perks.includes('iron'));
    // open north door from west (24,7) → stand (23,7); power switch at (31,1) → stand (31,2), hold
    at(G, a, 23, 7); press(G, a); at(G, a, 31, 2); hold(G, a, 1.4); ok('power-on', G.z.power);
    at(G, a, 5, 4); press(G, a); ok('perk-ironhide', a.perks.includes('iron') && a.maxHp === 250);
    // forge: open south door (24,31) from west → stand (23,31); forge at (31,38) → stand (31,37)
    at(G, a, 23, 31); press(G, a); a.weapons = [newSlot('r4'), newSlot('p9')]; a.cur = 0; at(G, a, 31, 37); hold(G, a, 2.5);
    ok('forge-upgrade', a.weapons[0].up && wdef(a.weapons[0]).name === 'R4 Valkyrie');
    // window: knock boards off and rebuild from inside the bunker (28,15) → stand (28,16)
    const w = G.map.windows.find((w) => w.x === 28 && w.y === 15); w.boards = 1; refreshTile(G.map, w.i);
    at(G, a, 28, 16); const p1 = a.points; hold(G, a, 0.7); ok('window-rebuild', w.boards === 2 && a.points === p1 + 10);
    // power-ups
    G.godMode = false;
    a.weapons[0].res = 0; ZM.takePowerup(G, { type: 'ammo', x: a.x, y: a.y }, a); ok('pu-max-ammo', a.weapons[0].res === wdef(a.weapons[0]).res);
    ZM.takePowerup(G, { type: 'double', x: a.x, y: a.y }, a); ok('pu-double', G.z.timers.double > 0);
    ZM.takePowerup(G, { type: 'insta', x: a.x, y: a.y }, a);
    const z1 = ZM.makeZombie(G, 'walker', a.x + 100, a.y); z1.rise = 0; z1.hp = 99999; damage(G, z1, 1, a, 'bullet', false, 'p9'); ok('pu-insta', !z1.alive);
    const zs = [0, 1, 2].map((k) => { const z = ZM.makeZombie(G, 'walker', a.x + 200, a.y + k * 30); z.rise = 0; return z; });
    ZM.takePowerup(G, { type: 'nuke', x: a.x, y: a.y }, a); run(G, 0.5); ok('pu-nuke', zs.every((z) => !z.alive));
    w.boards = 0; refreshTile(G.map, w.i); ZM.takePowerup(G, { type: 'barrier', x: a.x, y: a.y }, a); ok('pu-barrier', w.boards === WINDOW_BOARDS);
    // solo second wind: buy it, get downed, get back up
    at(G, a, 36, 23); a.perks = []; press(G, a); ok('perk-wind', a.perks.includes('wind'));
    damage(G, a, 9999, null, 'zombie'); ok('second-wind-down', a.down && a.selfRev > 0);
    run(G, 3.6); ok('second-wind-up', !a.down && a.alive);
    a.protectT = 0; damage(G, a, 9999, null, 'zombie'); run(G, 2); ok('solo-gameover', G.over);
    // ---------- zombies co-op: down + revive ----------
    G = newMatch({ mode: 'zombies', mapId: 'farm', variant: 'coop', players: [{ pidx: 0, op: 'hawk', name: 'A' }, { pidx: 1, op: 'nova', name: 'B' }] });
    const [p, q] = G.humans;
    damage(G, q, 9999, null, 'zombie'); ok('coop-down', q.down && q.alive && curSlot(q).id === 'p9');
    p.x = q.x + 20; p.y = q.y; for (let k = 0; k < 200; k++) { stepMatch(G, [{ useHold: true }, {}], STEP); G.vev.length = 0; }
    ok('coop-revive', !q.down && q.revives === 0 && p.revives === 1);
    q.protectT = 0; damage(G, q, 9999, null, 'zombie'); for (let k = 0; k < 60 * 31; k++) { stepMatch(G, [{}, {}], STEP); G.vev.length = 0; for (const z of G.actors) if (z.kind === 'zombie') z.alive = false; } ok('coop-bleedout', !q.alive && !G.over);
    // round end brings the dead player back
    G.z.phase = 'live'; G.z.spawned = G.z.total; for (const z of G.actors) if (z.kind === 'zombie') z.alive = false; run(G, 0.1, () => ({})); ok('coop-respawn-next-round', q.alive);
    // ---------- exploder / brute / hound basics ----------
    G = newMatch({ mode: 'zombies', mapId: 'downtown', variant: 'solo', players: [{ pidx: 0, op: 'hawk', name: 'T' }] }); G.z.round = 12;
    const h = G.humans[0]; G.godMode = true;
    for (const t of ['exploder', 'brute', 'hound', 'soldier']) { const z = ZM.makeZombie(G, t, h.x + 140, h.y); z.rise = 0; }
    run(G, 4); ok('specials-run', true);
    // ---------- team deathmatch ----------
    G = newMatch({ mode: 'tdm', mapId: 'outpost', diff: 'regular', players: [{ pidx: 0, op: 'hawk', name: 'ME', team: 0, loadout: { p: 'r4', s: 'p9' } }] });
    const me = G.humans[0]; const foe = G.actors.find((x) => x.team === 1);
    me.protectT = 0; foe.protectT = 0;
    for (let k = 0; k < 7; k++) { foe.protectT = 0; foe.alive = true; foe.hp = 100; damage(G, foe, 999, me, 'bullet', false, 'r4'); if (k === 3) ok('streak-recon', G.t.recon[0] > 0); }
    ok('tdm-score', G.t.score[0] === 7 && me.kills === 7);
    ok('streak-airstrike', G.projs.filter((x) => x.kind === 'shell').length >= 6);
    ok('weapon-drop', G.drops.length > 0);
    const d = G.drops[0]; me.x = d.x + 5; me.y = d.y; me.weapons = [newSlot('mx5'), newSlot('p9')];
    stepMatch(G, [{ use: true }], STEP); ok('drop-swap', me.weapons.some((w) => w.id === d.wid) || d.wid === 'mx5');
    // respawn
    foe.protectT = 0; foe.alive = true; foe.hp = 100; damage(G, foe, 999, me); const T0 = G.time; for (let k = 0; k < 60 * 3.2; k++) { stepMatch(G, [{}], STEP); G.vev.length = 0; } ok('respawn', foe.alive && foe.protectT > 0);
    // match end at score limit
    G.t.score[0] = G.t.limit; stepMatch(G, [{}], STEP); ok('tdm-end', G.over && G.winner === 0);
    // ---------- save code round trip ----------
    App.save.xp = 1234; App.save.best.outpost = 9; const code = encodeSave(); const back = decodeSave(code); ok('savecode', back && back.xp === 1234 && back.best.outpost === 9);
    ok('savecode-bad', decodeSave('nonsense') === null);
    return out;
  });
  for (const [k, v] of Object.entries(res)) console.log(v.padEnd(5), k);
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
  await b.close();
})();
