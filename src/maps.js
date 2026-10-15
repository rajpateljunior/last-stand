/* MAPS. Each map is a 64 × 40 grid of tiles (one tile = 40 world units). Edit the ASCII rows directly.
   Legend:
     #  wall                     .  outdoor ground          ,  indoor floor          :  road / asphalt     =  pavement / concrete
     D  door or debris: ZOMBIES = bought with points to open; TEAM DEATHMATCH = always open
     W  window (zombies tear the boards off and climb in; players can't pass but can shoot through)
     c  crate / furniture (blocks movement and bullets)      v  vehicle (tiles in a block = one vehicle)
     o  low cover: sandbags / hay (blocks movement; bullets get through half the time unless you're right behind it)
     f  chain-link or wood fence (blocks movement, bullets and sight pass)    T  tree     k  corn (slows, hides you)
     b  explosive barrel   g  gravestone (low cover)   L  lamp (light)   ~  puddle
     Z  zombie spawn       B  mystery box spot          P  perk machine (types in order of reading, see `perks`)
     F  Forge (weapon upgrade)   S  power switch   1-6 wall gun (see `wall`)   @  zombies start
     A / R  Team Deathmatch spawns (Task Force / Vultures)
   Doors get a price from how far they are from the start: 750, then 1000, 1250, 1500. */
const ROWS = {
  outpost: [
    "################################################################",
    "#.......................#......S.......#.....................T.#",
    "#.....................T.#.Z..........P.#......Z................#",
    "#..###W#########........#.....o..o.....#.....................Z.#",
    "#..#P,,,,B,,,,,#........#.........L....#..vvv............vv....#",
    "#..#,,,,,,,,,,,#....bb..#.c............#..vvv............vv....#",
    "#..#,,,,,,,,,,,W........#......cc....c.#.................vv....#",
    "#..#,c,,c,,c,,,#........D......cc......D.......................#",
    "#..#,c,,c,,c,,,#........D...........Z..D.......................#",
    "#..#,,,,,,,,,,,W........#....L.........#......L....vvv.........#",
    "#..#,c,,c,,c,,,#.....Z..#..oo......oo..#...........vvv.........#",
    "#..#,,,,,,,,,,3#........#..............#.......................#",
    "#..######,,#####........#5............B#.......ooo.............#",
    "#.......................#..............#.b.....................#",
    "#.T.....................#..............#................Z....T.#",
    "#.............c.....cc...###W######W###.............L..........#",
    "#.....Z..................#,,,,,B,,,,,,#........................#",
    "#AA....c..........L......#1,,,,,,,,,,2#.....vv...............RR#",
    "#AA....c.................#,,,,,,,,,,,,#.....vv..........vvv..RR#",
    "#AA......................D,,,,cccc,,,,D.....vv..........vvv..RR#",
    "#AA.......ooo............D,,,,,,,,,,,,D......................RR#",
    "#AA...............c......#,,,,,@,,,,,,#..........oo..........RR#",
    "#AA...............c......#,,,,,,,,,,,,#.............ooo......RR#",
    "#...........cc...........#cc,,,,,,,,,P#........................#",
    "#........................###W######W###...................L..b.#",
    "#.b.....................#..............#.....L..c.......c......#",
    "#.........L....oo.......#.....L........#.......................#",
    "#...................Z...#.b..........Z.#.......b.####W###W####.#",
    "#.......................#...cc....cc...#.......b.#,,,,,,,,,,B#.#",
    "#...ooooooo...oooooo....#..............#..vv.....#,,,,vvv,,,,#.#",
    "#.......................#......oo.....6#..vv.....,,,,,vvv,,,,#.#",
    "#.......................D..............D..vv.....,,,,,vvv,,,,#.#",
    "#.......................D..............D.........,,,,,,,,,,,,#.#",
    "#................L......#...cc....cc...#.........#,,cc,,cc,,,#.#",
    "#.......................#..............#.........#,,,,,,,,,,,#.#",
    "#...ooooo....oooooo.....#......oo......#.........#,,,,,,,,,,,#.#",
    "#..Z....................#..Z.........b.#...Z.....#4,,,,,,,,,P#.#",
    "#.T.........Z........T..#........L..Z..#.T.......#############.#",
    "#..........T............#.P....F.......#......T................#",
    "################################################################",
  ],
  downtown: [
    "################################################################",
    "#======B================bb==#=:Z::=#=Z============Z============#",
    "#=cc=====Z===L===cc=======2##=::::=#========Z=================Z#",
    "#=============Z=============DL::::=#####W####W######W####W######",
    "#Z==========================D=::::=#,,,,,,,,,,,#,,,,,,,,,,,,,S##",
    "#==###W####W#########DD###==#=:vv:=#,,,,,,,,,,,#,,,,,,,,,,,,,,##",
    "#==#,,,,,,,,,,B#,,,,,,,,,#==#=:vv:=#,,cc,cc,c,,#,,cc,,,cc,,,,,##",
    "#==#1,,,,,,,,,,#ccc,,,cc,#==#=:vv:=#,,,,,,,,,,,#,,,,,,,,,,,,,,##",
    "#==#,,,,,,,,,,,#,,,,,,,,,W==#=::::=#,,,,,,,,,,,,,,,,,,,,,,,,,,##",
    "#==W,cc,cc,cc,,,,,,,,,,,,#==#=::::LD,,,,,,,,,,,,,,,,,,,,,,,,,,##",
    "#==#,,,,,,,,,,,,,,,,,,,,,#==#=::::=D,,,,,,,,,,,#######,#########",
    "#==#,,,,,,,,,,,#####,#####==#=::::=#,,,,,,,,,,,#,,,,,,,,,,,,,,##",
    "#==#,,,,,@,,,,,#,,,,,,,,,#Z=#=vv::=#,,cc,cc,c,,#,,,,,,,,,,,,,,##",
    "#==W,cc,,,,,,,,#,,,,,,cc,#==#=vv::=#,,,,,,,,,,,#,,,cc,,,c,,,,,##",
    "#==#,,,,,,,,,,,#,cc,,,,,,W==#=vv::=#,,,,,,,,,,,#,,,,,,,,,,,,,,##",
    "#Z=#,,,,,,,,,,P#,,,,,,,,,#==#=::::=#3,,,,,,,,,,#P,,,,,,,,,,,,B##",
    "###########DD################=::::o######DD#####################",
    "#AA==L========oo===========D==:Z::==D=======L=oo=============RR#",
    "#AA:::::::::::::::vvv::::::D::::::::D:::::::::::::vvv::::::::RR#",
    "#AA:::vvv:::::::::vvv::::::D::::::::D:::::::::::::vvv::::::::RR#",
    "#AA:::vvv::::::::::::::vvv:D::::::::D:::vvv:::::::::::::vvv::RR#",
    "#AA::::::::::::::::::::vvv:D::::::::D:::vvv:::::::::::::vvv::RR#",
    "#AA=oo==============L======D==::::==D=================oo===L=RR#",
    "##########DD#################o::::=fffffDDfffffffffffffffffffff#",
    "#==#,,,,,,,,,,#,,,,,,,,,4#==#=::::=f===========================#",
    "#Z=#,,,,,,,,,,#,,,,,,,,,,#==#=::::=f=Z====L=====bb=====L======Z#",
    "#==#,,cc,,,c,,#,,cc,,,,,,W==#=::vv=f===========================#",
    "#==W,,,,,,,,,,#,,,,,,,,,,#==#=::vv=f===oooooooo================#",
    "#==#,,,,,,,,,,,,,,,,,,,,,D==D=::vv=f==============####,,######=#",
    "#==#,,,,,,,,,,,,,,,,,,,,,D==D=::::=f==============#,,,,,B,,,6#=#",
    "#==#####,######,,,,,,cc,,#=Z#L::::=D===c==c==c====#,,,,,,,,,,#=#",
    "#==#,,,,,,,,,,#,,,,,,,,,,#==#=::::=D==============#,cc,,,cc,,W=#",
    "#==#,,,,,,,,,,#,,,,,,,,,,W==#=::::=f=============5W,,,,,,,,,,#=#",
    "#==W,,cc,,,c,,#,,cc,,,,,,#==#=vv::=f==============#,,,,,,,,,,#=#",
    "#==#,,,,,,,,,,#,,,,,,,,,,#==#=vv::=f===c==c==c====#,cc,,,cc,,#=#",
    "#==#P,,,,,,,,,#B,,,,,,,,,#==#=vv::=f==============#,,,,,,,,,,#=#",
    "#==#####W##########W######==#=::::Lf==============#P,,,,,,,,F#=#",
    "#Z==========L===============#=::::=fPb=========b==########W###=#",
    "#===========Z=========Z=====#=::Z:=f========Z=================Z#",
    "################################################################",
  ],
  farm: [
    "################################################################",
    "#.....................##############......................Z....#",
    "#.T.....T.........T...Z......#####..##############W######......#",
    "#....T........T..............#,,,#..#P,,,,,,,,#,,,,,,,,S#..T...#",
    "#............................#,P,#..#,,,,,,,,,#,,,,,,,,,#......#",
    "#............................#,,,#..#,,,,,oo,,#,,o,,o,,,#......#",
    "#............................##,##..W,,,,,,,,,,,,,,,,,,,#......#",
    "#..T................................#,oo,,,,,,,,,,,,,,,,#....Z.#",
    "#...................................#,,,,,,,,,,,c,,,,cc,W......#",
    "#................T...fffDDfff.......#,,,,,,,,,,,,,,,,,,,#....RR#",
    "#....................f......f.......W,oo,,,,,,#,,,,,,,,,#....RR#",
    "#.T.........Z........fL.....f.Z.....#,,,,,oo,,#,,o,,o,,,#....RR#",
    "#....................f..Z...f....b..#,,,,,,,,,#,,,,,,,,,#....RR#",
    "#....................f......f....b..#,,,,,,,,4#,,,,,,,,B#....RR#",
    "#.....##W##W#####W###..vvv..f.......####DD###############....RR#",
    "#.Z...#1,,,,,#B,,,,,#..vvv..f...L.........................T....#",
    "#.....#,,,,,,#,,,,,,W.......f..............L.Z.................#",
    "#.....W,,cc,,#,,,,,,#.......f.......fffffffffffffffffffffDDffff#",
    "#AA...#,,,,,,#,,cc,,#.o.....f.:::::.f.kkkkk.kkkkk.kkkkk.kkkkk.k#",
    "#AA...D,,,,,,,,,,,,,#.o.....D.:::::.f.kkkkk.kZkkk.kkkkk.kkkkk.k#",
    "#AA...D###,##,,,@,,,#L......D.:::::.f.kkkkk.kkkkk.kkkkkZkkkkk.k#",
    "#AA...#,,,,,,#,,,,,,D.##,##.f.:::::.f.kkkkk.kkkkk.kkkkk.kkkkk.k#",
    "#AA...#,,,,,,#,,,,,,D.#3,,#.f.......f..........................#",
    "#AA...W,,ccc,#,,cc,,#.#####.f.......f.kkkkk.kkkkk.kkkkk.kkkkk.k#",
    "#..Z..#,,,,,,#,,,,,,#....cc.f.......D.kkkkk.kk.....kkkk.kkkkk.k#",
    "#.....#2,,,,,#,,,,,P#.......f.......D.kkkkk.kk5c...kkkk.kkkkk.k#",
    "#.....###W######W####.......f...L...f.kkkkk.kk..P..kkkk.kkkkkZk#",
    "#....................f....oof.......f..........................#",
    "#....................f.oo...f.......f.kkkkk.kkkkk.kkkkk.kkkkk.k#",
    "#.........Z......Z...f....Z.f..vvv..f.kkkkk.kkkkk.kkkkk.kkkkk.k#",
    "#....................f....L.f..vvv..f.kkkZk.kkkkk.fffffDDffffff#",
    "#.Z..................ffffffff.......f.kkkkk.kkkkk.f6.........B.#",
    "#...................................f.kkkkk.kkkkk.f.g.g.g.g.g..#",
    "#.................................Z.f.kkkkk.kkkkk.f............#",
    "#ffffffffffffffDDffffffffffffffffffff.kkkkk.kkkkk.f............#",
    "#...................................f.kkkkk.kkkkk.f.g.g.g.g....#",
    "#...T.....................T..b......f.kkkkk.kkkkk.f............#",
    "#...........T.......T...............f.kZkkk.kkkkk.f......Z.....#",
    "#........T..........................f.kkkkk.kkkkk.fP.........F.#",
    "################################################################",
  ],
};

/* Map list. perks = perk machine types for each P in reading order (left→right, top→bottom); wall = gun for 1..6. */
const MAP_DEFS = [
  { id: "outpost", name: "OUTPOST", sub: "Night · Rain", desc: "A fenced army base in the rain. The command bunker is your last stand. Three lanes for Team Deathmatch.",
    perks: ["swift", "iron", "wind", "quick", "rapid"], wall: ["dmr", "sg12", "mx5", "r4", "k74", "hammer"], rows: ROWS.outpost,
    theme: { dark: 0.72, amb: "#03060c", weather: "rain", grade: ["#1b3a66", 0.08], fog: 0,
      out: { kind: "mud", base: "#3a4129", v: ["#444b2d", "#353a26", "#4a4632", "#2f3424"] }, in: { kind: "concrete", base: "#575754", v: ["#5e5e5a", "#50504d"] },
      road: "#2b2d2f", pave: "#5d5c58", walls: [["concrete", "#6c6b66"], ["metal", "#5b6156"], ["concrete", "#625f58"]], perim: ["concrete", "#5a5853"], lamp: "#ffd9a0", music: 0 } },
  { id: "downtown", name: "DOWNTOWN", sub: "Dusk · City", desc: "Main Street at sundown. Start in Rosie's Diner and fight block by block to the gas station.",
    perks: ["wind", "iron", "quick", "rapid", "swift"], wall: ["dmr", "sg12", "mx5", "r4", "k74", "hammer"], rows: ROWS.downtown,
    theme: { dark: 0.42, amb: "#140a1e", weather: "embers", grade: ["#ff7a3a", 0.08], fog: 0,
      out: { kind: "concrete", base: "#7d7a74", v: ["#86837c", "#74716b", "#7f7b72"] }, in: { kind: "tile", base: "#6f5a48", v: ["#7a6350", "#665343"] },
      road: "#2e3034", pave: "#8a8780", walls: [["brick", "#7a3d30"], ["brick", "#6b4a3a"], ["stucco", "#8a8170"], ["brick", "#5e3a34"]], perim: ["brick", "#4e3a33"], lamp: "#ffcf8a", music: 1 } },
  { id: "farm", name: "FARMHOUSE", sub: "Fog · Countryside", desc: "A lonely farm in thick fog. Corn rows, a red barn, a graveyard. Something moves in the field.",
    perks: ["iron", "swift", "wind", "rapid", "quick"], wall: ["dmr", "sg12", "mx5", "r4", "k74", "hammer"], rows: ROWS.farm,
    theme: { dark: 0.6, amb: "#070a0b", weather: "fog", grade: ["#5f7f74", 0.06], fog: 0.5,
      out: { kind: "grass", base: "#3e4b2c", v: ["#465530", "#38442a", "#4a4a30", "#3a4630"] }, in: { kind: "wood", base: "#5e4430", v: ["#664a33", "#563e2c"] },
      road: "#5a4a36", pave: "#6a5d4a", walls: [["wood", "#7e7766"], ["wood", "#6e2620"], ["wood", "#6e5a42"], ["stone", "#5e5b54"]], perim: ["wood", "#4a3a2a"], lamp: "#ffd48a", music: 2 } },
];

/* Tile types */
const T_FLOOR = 0, T_WALL = 1, T_HIGH = 2, T_LOW = 3, T_FENCE = 4, T_WINDOW = 5, T_DOOR = 6, T_TREE = 7, T_BARREL = 8;
/* Floor looks */
const F_OUT = 0, F_IN = 1, F_ROAD = 2, F_PAVE = 3, F_WATER = 4, F_CORN = 5;
const FLOOR_OF = { ".": F_OUT, ",": F_IN, ":": F_ROAD, "=": F_PAVE, "~": F_WATER, "k": F_CORN };
const WINDOW_BOARDS = 5;

/* Parse a map definition into the runtime map: tile grid, objects, doors, windows, areas. */
function parseMap(def) {
  const rows = def.rows, H = rows.length, W = rows[0].length;
  const N = W * H;
  const m = { def, id: def.id, W, H, N, pw: W * TILE, ph: H * TILE, theme: def.theme,
    tile: new Uint8Array(N), floor: new Uint8Array(N), ch: [], obj: new Int16Array(N).fill(-1),
    doors: [], windows: [], spawners: [], boxSpots: [], perks: [], wallbuys: [], lamps: [], barrels: [], spawns: [[], []],
    vehicles: [], lows: [], crates: [], forge: null, power: null, start: null, area: new Int16Array(N).fill(-1), areaN: 0 };
  const idx = (x, y) => y * W + x;
  m.idx = idx;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m.ch[idx(x, y)] = rows[y][x];
  const ch = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? "#" : rows[y][x]);
  const isFloorCh = (c) => FLOOR_OF[c] !== undefined;
  // floor look for tiles that are objects: take the most common floor around them
  const inheritFloor = (x, y) => {
    const cnt = {};
    for (let r = 1; r <= 2; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const c = ch(x + dx, y + dy); if (isFloorCh(c) && c !== "k") cnt[c] = (cnt[c] || 0) + (r === 1 ? 3 : 1);
    }
    let best = ".", bn = -1; for (const k in cnt) if (cnt[k] > bn) { bn = cnt[k]; best = k; }
    return FLOOR_OF[best];
  };
  let pi = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y][x], i = idx(x, y);
    let t = T_FLOOR, f = FLOOR_OF[c];
    if (f === undefined) f = inheritFloor(x, y);
    const wx = (x + 0.5) * TILE, wy = (y + 0.5) * TILE;
    switch (c) {
      case "#": t = T_WALL; break;
      case "c": t = T_HIGH; m.crates.push({ x, y }); break;
      case "v": t = T_HIGH; break;
      case "o": t = T_LOW; break;
      case "g": t = T_LOW; m.lows.push({ x, y, grave: true }); break;
      case "f": t = T_FENCE; break;
      case "T": t = T_TREE; break;
      case "W": t = T_WINDOW; m.windows.push({ x, y, i, boards: WINDOW_BOARDS, sides: [], ori: 0 }); break;
      case "D": t = T_DOOR; break;
      case "b": t = T_BARREL; m.barrels.push({ x, y, i, hp: 60, alive: true }); break;
      case "Z": m.spawners.push({ x, y, wx, wy }); break;
      case "B": t = T_HIGH; m.boxSpots.push({ x, y, wx, wy }); break;
      case "P": t = T_HIGH; m.perks.push({ x, y, wx, wy, perk: def.perks[pi++] || "iron" }); break;
      case "F": t = T_HIGH; m.forge = { x, y, wx, wy }; break;
      case "S": t = T_HIGH; m.power = { x, y, wx, wy }; break;
      case "L": m.lamps.push({ x, y, wx, wy }); break;
      case "A": m.spawns[0].push({ x, y, wx, wy }); break;
      case "R": m.spawns[1].push({ x, y, wx, wy }); break;
      case "@": m.start = { x, y, wx, wy }; break;
      default:
        if (c >= "1" && c <= "6") m.wallbuys.push({ x, y, wx, wy, gun: def.wall[+c - 1] });
    }
    m.tile[i] = t; m.floor[i] = f;
  }
  // vehicles + low-cover runs: group connected tiles
  const seen = new Uint8Array(N);
  const group = (x0, y0, c) => {
    const out = [], q = [[x0, y0]]; seen[idx(x0, y0)] = 1;
    while (q.length) { const [x, y] = q.pop(); out.push([x, y]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (ch(nx, ny) === c && !seen[idx(nx, ny)]) { seen[idx(nx, ny)] = 1; q.push([nx, ny]); } } }
    return out;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = rows[y][x];
    if ((c === "v" || c === "o") && !seen[idx(x, y)]) {
      const g = group(x, y, c);
      let x0 = 99, y0 = 99, x1 = -1, y1 = -1; for (const [gx, gy] of g) { x0 = Math.min(x0, gx); y0 = Math.min(y0, gy); x1 = Math.max(x1, gx); y1 = Math.max(y1, gy); }
      (c === "v" ? m.vehicles : m.lows).push({ x0, y0, x1, y1, tiles: g, seed: x * 31 + y * 17 });
    }
    if (c === "D" && !seen[idx(x, y)]) {
      const g = group(x, y, "D");
      // style: inside a wall line = door, inside a fence line = gate, otherwise debris pile
      const near = (cc) => g.some(([gx, gy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ch(gx + dx, gy + dy) === cc));
      const style = near("#") ? (g.length > 3 ? "debris" : "door") : near("f") ? "gate" : "debris";
      const d = { id: m.doors.length, tiles: g.map(([gx, gy]) => idx(gx, gy)), cells: g, open: false, cost: 750, sides: [], style,
        cx: (g.reduce((s, p) => s + p[0], 0) / g.length + 0.5) * TILE, cy: (g.reduce((s, p) => s + p[1], 0) / g.length + 0.5) * TILE,
        horiz: g.length > 1 && g[0][1] === g[1][1] };
      for (const t of d.tiles) m.obj[t] = d.id;
      m.doors.push(d);
    }
  }
  for (const w of m.windows) {
    const hor = ch(w.x - 1, w.y) === "#" || ch(w.x + 1, w.y) === "#";   // window in a horizontal wall: zombies move vertically
    w.ori = hor ? 0 : 1;
    w.wx = (w.x + 0.5) * TILE; w.wy = (w.y + 0.5) * TILE;
  }
  for (const b of m.barrels) { b.wx = (b.x + 0.5) * TILE; b.wy = (b.y + 0.5) * TILE; }
  computeAreas(m);
  // which side of each wall buy has the wall (for drawing the chalk outline)
  for (const wb of m.wallbuys) {
    wb.face = [[0, -1], [1, 0], [0, 1], [-1, 0]].find(([dx, dy]) => ch(wb.x + dx, wb.y + dy) === "#" || ch(wb.x + dx, wb.y + dy) === "c") || [0, -1];
  }
  return m;
}

/* Areas = regions players can walk between with every door closed. Used for zombie spawns and door prices. */
function computeAreas(m) {
  const { W, H, tile, area } = m;
  const pass = (i) => tile[i] === T_FLOOR;
  let n = 0;
  for (let i = 0; i < m.N; i++) {
    if (area[i] >= 0 || !pass(i)) continue;
    const q = [i]; area[i] = n;
    while (q.length) {
      const c = q.pop(), x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (area[j] < 0 && pass(j)) { area[j] = n; q.push(j); }
      }
    }
    n++;
  }
  m.areaN = n;
  const sidesOf = (cells) => {
    const s = new Set();
    for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const a = area[ny * W + nx]; if (a >= 0) s.add(a);
    }
    return [...s];
  };
  for (const d of m.doors) d.sides = sidesOf(d.cells);
  for (const w of m.windows) w.sides = sidesOf([[w.x, w.y]]);
  const objArea = (o) => { const s = sidesOf([[o.x, o.y]]); return s.length ? s[0] : -1; };
  for (const o of [...m.spawners, ...m.lamps, ...m.spawns[0], ...m.spawns[1], ...m.wallbuys]) o.area = area[o.y * W + o.x];
  for (const o of [...m.boxSpots, ...m.perks]) o.area = objArea(o);
  if (m.forge) m.forge.area = objArea(m.forge);
  if (m.power) m.power.area = objArea(m.power);
  m.startArea = m.start ? area[m.start.y * W + m.start.x] : 0;
  // door prices by depth from the start area
  const depth = new Array(n).fill(99); depth[m.startArea] = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (const d of m.doors) {
      const ds = d.sides.map((a) => depth[a]);
      const lo = Math.min(...ds);
      for (const a of d.sides) if (depth[a] > lo + 1) { depth[a] = lo + 1; changed = true; }
    }
  }
  m.depth = depth;
  for (const d of m.doors) d.cost = Math.min(1500, 750 + 250 * Math.min(...d.sides.map((a) => depth[a])));
}
