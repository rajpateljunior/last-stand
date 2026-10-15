# Last Stand: NOTES

Last reviewed: 2026-10-15 (release 1).

## What it is
A top-down shooter for iPhone, iPad and computer with two modes: **Zombies** (endless rounds, Call of Duty Zombies–style) and **Team Deathmatch** (4 vs 4, bots fill empty spots). Solo, two players on one screen, or two players online. Three maps. Installable to the Home Screen and fully offline (online play needs the internet).
Live: https://rajpateljunior.github.io/last-stand/ · Repo: `rajpateljunior/last-stand`

## Design decisions (Raj's)
- Raj picked every default from the planning chat: top-down view, both team modes, two style modes, my choice of name (he named the repo `last-stand`, so the game is **Last Stand**).
- "As realistic as possible", not 3D: 2.5D walls with height, flashlights that cast shadows, rain / fog / embers, muzzle flash, tracers, shell casings, bullet impacts, smoke, scorch marks, synthesized gunshots with echo.
- Player setups for every mode: solo vs bots; co-op (same team vs bots); versus (each leads bots in TDM, or competes for points in Zombies). Two players max.
- **Zombies**: endless rounds that get harder, wall guns, buyable doors/debris/gates, Mystery Box (it moves after a few uses), 5 perks (power switch needed except Second Wind), the **Forge** upgrade, window barricades you rebuild for points, 6 power-ups, hound round every 5th round, special zombies (soldier zombies that drop guns, exploders, brutes). "Grab guns from other people" = soldier zombies drop their guns; in TDM everyone drops their primary.
- **Last stand** (the name): in co-op, when you go down you can still crawl and fire your pistol until a teammate revives you (30 s bleed-out). Bled-out players come back next round. Solo: Second Wind gets you back up (3 uses).
- **Team Deathmatch**: first to 40 kills or 6 minutes, respawn after 3 s with 2 s protection. Killstreaks: 4 = Recon Drone (enemies on minimap 30 s), 7 = Airstrike (auto-targets the biggest group).
- Two styles in Settings → Style: **STANDARD** (default, no blood, zombies crumble to ash) and **GRITTY** (blood, bodies that stay ~14 s). Looks only; never changes the rules.
- Ranks 1–30 from XP (both modes). Ranks unlock TDM loadout guns and operators. Zombies always has every gun (wall / box).
- Text stays out of the middle (Raj disliked blocking text in Wild Riders): only round number / power-up / killstreak banners show briefly near the top centre. Toasts sit just above the gun panel.

## Controls
- Touch: floating left stick = move; floating right stick = aim, fires while aimed (quick tap = shoot the nearest enemy in front). Buttons near the right thumb: RELOAD, GRENADE, KNIFE, and a yellow USE button that appears when there's something to buy/do (HOLD actions show a ring). Tap the gun panel to swap. Aim assist (Settings) nudges aim ~9°.
- Narrow screens (phone upright) put the gun panel top-right so thumbs have the bottom.
- Two players on one touch screen: each gets half the screen with their own sticks/buttons. Co-op shares one camera (zooms out, players are kept within ~620 units); TDM rivals use split screen.
- Keyboard + mouse: WASD, mouse aim, click fire, R reload, F/E use (hold), G or right-click grenade, V/Space knife, Q/1/2/wheel swap, Esc/P pause. Two on one keyboard: P1 WASD + Space fire, R/F/G/V/Q; P2 arrows + L fire, U reload, O use, K grenade, J knife, I swap; both auto-aim.

## Architecture
- **Source of truth is `src/`.** `index.html`, `sw.js` and `version.json` are build outputs: run `python3 tools/build.py`, then commit them together. Never hand-edit `index.html`.
- Build inlines `src/style.css` and the JS (order: core, data, maps, world, art, audio, game, zombies, tdm, ai, render, hud, input, net, ui, update, main) into `src/shell.html`, and names the service-worker cache `last-stand-<hash>`, so any change makes a new cache automatically.
- Fixed 60 Hz simulation (`stepMatch` in game.js). Modes plug in through `ZM.*` (zombies.js) and `TD.*` (tdm.js). The sim never touches the DOM; it pushes visual/sound events into `G.vev`, which `fxEvent` (render.js) turns into particles, decals and sounds (and the host forwards to an online guest).
- Map tiles are 40 world units. Collision = circles vs the tile grid (world.js). Zombies follow a flow field (Dijkstra from all players, every 0.3 s); bots use A* plus straight-line shortcuts.
- Rendering: ground + all static props baked once at 1.5 px/unit (`bakeGround` + static pass of `drawPropsBase`); doors, windows, barrels, box, perks drawn per frame; wall tops, trees, corn and lamps drawn over actors. Zombies are pre-rendered animation frames (`zombieSprite`). Darkness = low-res light canvas with flashlight cones ray-cast against walls (`m.light`).
- Online: PeerJS (vendored `peerjs.min.js`, same as Wild Riders). Host runs the whole game; the guest moves its own soldier and predicts its own shots, sends controls at 30 Hz; the host sends the world at 20 Hz (`net.js`). Button presses are sent as counters so none are lost.

## Data tables
- `src/data.js`: `WEAPONS` (damage vs players `dmg`, vs zombies `zdmg` = dmg × `ZMUL` 3.5 unless set, rpm, mag, range, wall price, box weight, TDM unlock rank, Forge upgrade), `KNIFE`, `FRAG`, `PERKS`, `ZTYPES`, `zombieHp`, `zombieCount`, `ZCAP` (20 alive solo, 26 co-op), `POINTS`, `POWERUPS`, `DROP`, `TDM`, `STREAKS`, `DIFF` (bot skill), `OPERATORS`, ranks (`xpForRank`), `XP`.
- `src/maps.js`: three 64 × 40 ASCII maps with a legend at the top, plus `perks` (types in reading order) and `wall` (guns for 1–6) per map, and each map's theme (darkness, weather, colours). Door prices come from distance to the start: 750 / 1000 / 1250 / 1500.
- Maps: **Outpost** (night, rain; command bunker hub with four yards; power in the north yard, Forge in the south depot) · **Downtown** (dusk; Rosie's Diner → Main Street → police precinct (power) / apartments / gas station (Forge)) · **Farmhouse** (fog; farmhouse → yard → barn (power) / cornfield (corn hides you, slows you) → graveyard (Forge)).

## Save format
- `localStorage` key `last-stand-save-v1`, object with `v: 1`: `{ v, xp, op, op2, lo:{p,s}, lo2:{p,s}, best:{mapId: round}, bestCoop:{mapId: round}, stats:{matches, zKills, tKills, wins, rounds, crits, deaths, bestStreak}, settings:{music, sfx, tone, gfx, assist, diff}, seenHelp, last:{mode, map, players, variant, diff} }`.
- `loadSave()` only accepts `v === 1` and merges onto defaults; an unreadable save is kept under `last-stand-save-v1-rescue` instead of being overwritten.
- Save code: `LSTAND1-` + base64 of the JSON (Settings → Save Code). Any future format change must still read v1 saves and codes.
- Other keys: `ls-version` (What's New), `ls-backup` (backup reminder), `ls-install-dismissed`.

## Updates (how a release reaches Raj's phone)
- Same system as Wild Riders. **Never tell Raj to delete and re-add the Home Screen app** (it erases the save).
- Each release: edit `APP_VERSION` / `WHATS_NEW` in `src/update.js`, run `python3 tools/build.py`, commit `version.json` too. Installed copies show a green **New update available · UPDATE** banner on menus.
- Backup reminder after 3 matches, then every 5 matches at most every 3 days.

## Tests (Playwright, Chromium; serve the folder first: `python3 -m http.server 8765`)
- `node tools/features.js` — 34 rule checks: wall guns, doors, box, power, perks, Forge, windows, all power-ups, Second Wind, co-op down/revive/bleed-out/respawn, special zombies, TDM score/streaks/drops/swap/respawn/end, save code.
- `node tools/sim.js zombies|zcombat|tdm [runs]` — balance: a bot plays solo zombies (shopping), or plays with a typical loadout per round (`zcombat`), or 8 bots play TDM.
- `node tools/shots.js <out> <w> <h> <mode> <map> <secs> [gritty] [touch] [coop|split]` — a bot plays, then a screenshot.
- `node tools/smoke.js <out>` — menus and each mode start without errors. `node tools/offline.js` — service worker + offline play.
- `node tools/online.js <out> zombies|tdm` — two browsers play online via a local PeerServer (`node tools/peersrv.js`, needs `npm install peer@1` in /tmp/peersrv).
- `node tools/icons.js` — re-render the app icons from the emblem.

## Balance notes (bot results, 2026-10-15)
- Combat check (bot given a typical loadout per round, all doors open): reaches rounds 11–19 on all maps. The shopping bot alone dies around rounds 4–8 (its errands are simple), so real players should do better; nothing measured on a phone yet.
- Hound rounds were the big killer: now max 3 hounds alive (5 co-op), packs every 1.1–2.2 s, speed 160–176 (players 172), 25 damage.
- 8-bot TDM: matches reach the old 30-kill limit in ~2 minutes, so the limit is 40 and regular bots react slower (0.5 s).

## Known issues / untested
- Not tried on a real iPhone or iPad yet: touch feel (stick sizes, aim assist strength, button reach), performance on older phones (the Graphics setting AUTO lowers resolution if frames are slow), iOS audio, Home Screen install, rotation.
- Online play tested only between two local browsers with a local PeerServer, not over the internet or cellular. Some cellular networks block direct connections (same limit as Wild Riders). Online games can't pause.
- Difficulty is estimated with bots, not people; every number is a one-line tune in `data.js` / `zombies.js`.
- Two players on one iPhone is cramped (four sticks on a small screen); iPad or computer is much better.

## Ideas not yet done (for future releases)
- Last Squad Standing (one life per round, best of 7) and Gun Game (each kill changes your gun) — planned release 2.
- Infected, Extraction, Capture the Flag / King of the Hill.
- A boss zombie every 10 rounds; more killstreaks (sentry gun); grenade types (monkey bomb, flashbang); weapon camos earned by kills.
- More maps; a map-specific Zombies easter egg; per-gun attachments.
