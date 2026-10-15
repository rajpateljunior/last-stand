# Last Stand

Top-down zombie survival and team deathmatch for iPhone, iPad and computer. Endless Zombies rounds (wall guns, Mystery Box, perks, power, Forge upgrades, power-ups, hound rounds) and 4 vs 4 Team Deathmatch with bots and killstreaks. Solo, two players on one screen, or online with a room code. Three maps: Outpost, Downtown, Farmhouse. Installable to the Home Screen and fully offline.

**Play:** https://rajpateljunior.github.io/last-stand/ (open in Safari → Share → Add to Home Screen)

## How it's built
- One self-contained `index.html`, no frameworks, no image or audio files. All art is drawn in code, all sound is synthesized with WebAudio.
- Top-down 2.5D canvas renderer with ray-cast flashlight shadows, fixed 60 Hz simulation, flow-field zombies, A* bots.
- PWA: `manifest.webmanifest`, `sw.js` (cache-first, cache name stamped from a content hash), UPDATE banner via `version.json`.
- Online 2-player: direct WebRTC via PeerJS (`peerjs.min.js`, MIT). The free public PeerJS server only introduces the two devices.

## Editing
Source lives in `src/`. After editing, rebuild and commit `src/`, `index.html`, `sw.js` and `version.json` together:

```
python3 tools/build.py
```

| File | What's in it |
|---|---|
| `src/data.js` | Weapons, perks, zombie types, power-ups, TDM rules, bots, operators, ranks |
| `src/maps.js` | The three maps (ASCII, with a legend), themes, map parser |
| `src/world.js` | Collision, line of sight, zombie flow field, A* |
| `src/art.js` | Baked ground textures, props, soldiers, zombie animation frames, guns, emblem |
| `src/audio.js` | Synthesized guns, zombies, stingers, ambience, music |
| `src/game.js` | Actors, weapons, hitscan, grenades, explosions, damage, pickups, USE button |
| `src/zombies.js` | Rounds, spawning, zombie AI, box, perks, Forge, power-ups, last stand |
| `src/tdm.js` | Team Deathmatch rules, respawns, killstreaks |
| `src/ai.js` | Soldier bots, zombies bot (title demo + balance tests) |
| `src/render.js` | Camera, walls, props, lighting, effects, weather |
| `src/hud.js` | HUD, minimap, kill feed |
| `src/input.js` | Touch twin-stick, keyboard + mouse, on-screen controls |
| `src/net.js` | Online play |
| `src/ui.js` | Menus, setup, armory, results, settings, saves |
| `src/update.js` | UPDATE banner, What's New (edit APP_VERSION/WHATS_NEW each release), backup reminder |
| `src/main.js` | Boot, main loop, PWA glue |

Tests are listed in `NOTES.md`.
