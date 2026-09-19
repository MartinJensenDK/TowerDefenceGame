# Troll Towers – 3D Browser Tower Defence: Design Spec

Date: 2026-09-19
Status: Approved by owner (sections 1–5 reviewed in chat)

## 1. Goal

A cartoon-styled 3D tower defence game that runs in the browser. Cartoon
towers operated by small trolls defend a base against waves of enemy
trolls. Focus is on the towers and their funny shooting effects.
Hosted on Cloudpanel as a Node.js site; developed locally first.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Economy | Gold (spend on towers) and Score (highscore) are separate. Both earned per kill and per wave. |
| Waves | Fixed 20 waves per map, then optional Endless mode. |
| Enemies | Trolls of several types. Towers are operated by small trolls too, but the tower is the focus. |
| Building | Free placement on a grid, any `buildable` tile. |
| Backend | Express + SQLite for a global highscore list from day one. |
| 3D models | Placeholder geometry first; a model contract lets Blender `.glb` files replace placeholders with no code change. |
| Towers | 3 levels (base + 2 upgrades) and selling from the start. |
| Language | English now; all strings in one i18n file so Danish can be added later. |
| Tech | Three.js + Vite frontend, Express + better-sqlite3 backend, Vitest + Supertest tests. |

## 2. Architecture

One npm workspace with two packages.

```
Game - TowerDefence/
  package.json           workspace root: scripts build / dev / start / test
  client/                Vite + Three.js (ES modules, plain JavaScript)
    index.html
    src/
      main.js            boot: load i18n, show menu, start game
      game/              PURE game logic, no Three.js, no DOM
        Game.js          owns state, update(dt), emits events
        Grid.js          tiles, road waypoints, buildable checks, frozen tiles
        Enemy.js         movement along path, hp, speed modifiers
        Tower.js         targeting, cooldown, upgrade/sell math
        Wave.js          wave scheduling, endless generator
        Economy.js       gold, score, lives
        validateMap.js   map JSON validator
        events.js        tiny event emitter
      render/            Three.js
        SceneManager.js  renderer, lights, resize, render loop
        CameraRig.js     OrbitControls wrapper with limits
        MapRenderer.js   tiles, decor, road, water, frozen overlay
        ModelLibrary.js  loads .glb or returns placeholder
        EnemyView.js     one per enemy, animations
        TowerView.js     one per tower, turret rotation, ghost preview
        Effects.js       projectiles, sprites, particles, squash-stretch
      ui/                HTML/CSS overlay
        Hud.js           gold / score / lives / wave / next-wave button
        BuildPanel.js    tower choice, upgrade, sell
        Menu.js          map select, game over, map cleared, endless prompt
        Highscores.js    list + submit form
        i18n.js          t('key') lookup
      i18n/en.json
      data/
        towers.json
        enemies.json
        maps/snow.json desert.json green.json water.json
    public/models/       Blender .glb files go here (see docs/model-contract.md)
  server/
    index.js             Express: static client/dist + /api/highscores
    db.js                better-sqlite3 setup and queries
    data/                highscores.db (created automatically, git-ignored)
  docs/
    model-contract.md
    superpowers/specs/   this file
    superpowers/plans/   implementation plan
```

### Core principle

`game/` never imports Three.js or touches the DOM. `Game.update(dt)`
advances the simulation and emits events; `render/` and `ui/` subscribe.

Events (name → payload):

- `enemy:spawned` {enemy}
- `enemy:moved` (not emitted; views read position each frame)
- `enemy:hit` {enemy, damage, towerType}
- `enemy:died` {enemy, gold, score}
- `enemy:reachedBase` {enemy, livesLost}
- `tower:built` {tower}
- `tower:upgraded` {tower}
- `tower:sold` {tower, refund}
- `tower:fired` {tower, target, projectileType}
- `tile:frozenChanged` {tiles[]}
- `wave:started` {wave}
- `wave:ended` {wave, bonusGold, bonusScore}
- `game:won` {score, wave}
- `game:lost` {score, wave}
- `economy:changed` {gold, score, lives}

## 3. Maps, grid, camera

### Grid

Each map is JSON:

```json
{
  "id": "green",
  "name": "Green Meadows",
  "theme": "green",
  "width": 16, "height": 12,
  "tiles": ["................", "..RRRRRR........", ...],
  "paths": [ [[0,5],[5,5],[5,9],[12,9],[12,2],[15,2]] ],
  "base": [15,2],
  "waves": [ { "spawns": [ {"type":"scout","count":8,"interval":0.8,"path":0} ] }, ... ],
  "startGold": 200,
  "modifiers": { "frostBonus": 1.0 }
}
```

Tile characters: `.` buildable, `R` road, `W` water, `D` decor (not
buildable). One tile = 2×2 world units. Waypoints are tile coordinates;
enemies move along straight segments between them. Several paths per map
are allowed; each wave spawn entry names its path.

The validator (run on load and in tests) checks: dimensions match, each
path starts on a road tile at a map edge and ends at `base`, consecutive
waypoints are axis-aligned and every tile between them is road, exactly
20 waves, every enemy type exists.

### The four starting maps

| id | Name | Theme | Character |
|---|---|---|---|
| snow | Frosty Peaks | snow | Long winding road; `frostBonus` 1.25 makes Frozen towers slow 25 % more |
| desert | Dusty Dunes | desert | Short, fairly straight road; enemies arrive fast |
| green | Green Meadows | green | Beginner map, wide build area, one long curve |
| water | Soggy Swamp | water | Many water tiles, two spawns / two paths |

Theme controls ground colors, sky/fog color, and which decor models are
placed (tree / rock / cactus / reed).

### Camera

Three.js OrbitControls targeting map centre. Rotate 360° (right-drag or
left-drag on empty ground with no build action), zoom via wheel
(distance clamped between ~10 and ~45 units), polar angle clamped to
25°–70°. Two-finger touch zoom/rotate comes with OrbitControls.
Panning disabled.

### Building interaction

Left-click a `buildable` tile → BuildPanel opens; hovering a tower button
shows a translucent ghost model plus range circle on the tile; click
confirms if gold suffices. Left-click an existing tower → panel shows
level, stats, Upgrade (cost) and Sell (refund). Esc / click elsewhere
closes the panel.

## 4. Towers, enemies, waves

### Towers (`towers.json`)

Each tower has `levels[0..2]`. Upgrade cost is per level; sell refund is
70 % of total gold invested.

| Tower | Cost L1/L2/L3 | Fire rate | Damage | Range (units) | Special |
|---|---|---|---|---|---|
| crossbow | 50 / 40 / 60 | 3.0/s → 3.5 → 4.0 | 6 → 8 → 11 | 7 → 8 → 9 | Hits flying. Single arrow projectile. |
| spike | 80 / 60 / 90 | continuous (tick every 0.5 s) | 4 → 6 → 9 per tick to all ground enemies in range | 3.5 → 4 → 4.5 | Ground only. No turret. |
| cannon | 150 / 120 / 180 | 0.5/s → 0.6 → 0.7 | 40 → 60 → 90, splash radius 2.5 (50 % dmg) | 10 → 11 → 12 | Hits flying. Slow lobbed shell. |
| frozen | 100 / 80 / 120 | – | 0 | affects road tiles within 1 → 2 → 3 tiles | Freezes road tiles; ground enemies on frozen tiles move at 50 % speed (× map frostBonus). Flying ignores. |

Targeting rule for crossbow/cannon: nearest-to-base enemy in range
(“first”). Towers with a turret rotate toward the current target.

Frozen tiles are a property of the grid: `Grid.recomputeFrozen()` runs
whenever a frozen tower is built, upgraded or sold; enemies read the
speed multiplier from the tile under them every update.

### Enemies (`enemies.json`)

| id | Name | HP | Speed (units/s) | Gold | Score | Flying | Lives cost |
|---|---|---|---|---|---|---|---|
| scout | Scout Troll | 30 | 3.0 | 5 | 10 | no | 1 |
| brute | Brute Troll | 160 | 1.4 | 15 | 30 | no | 2 |
| bat | Bat Troll | 60 | 2.2 | 10 | 20 | yes | 1 |
| boss | Boss Troll | 1200 | 1.0 | 100 | 300 | no | 5 |

Wave scaling: enemy HP is multiplied by `1 + 0.06 × (wave − 1)`.

### Waves

20 hand-authored waves per map in the map JSON. Boss on waves 10 and 20.
A wave ends when all its enemies are dead or have reached the base.
Wave bonus: `20 gold + 50 × wave` score. Player presses "Next wave"
(or auto-start after 10 s countdown, toggle in HUD). Calling the next
wave early while enemies remain is allowed and grants +10 % of that
wave's bonus as extra score.

Base has 20 lives. Lives ≤ 0 → `game:lost`.

After wave 20 is cleared → `game:won`, menu offers "Submit score" and
"Continue in Endless". Endless generates wave N (N > 20) as: total
enemy budget `40 + 8×N`, filled from a weighted mix (scout 50 %, bat
25 %, brute 25 %), boss every 10th wave, HP multiplier continues the
same formula. Score submitted at loss records the wave reached.

### Cartoon effects (v1)

- Tower fires: quick scale squash (0.85 y, 1.1 xz) then overshoot back
  over ~0.25 s. Cannon additionally recoils backward 0.3 units.
- Hit: billboard sprite "POW!" / star burst at impact, 0.3 s, scales up
  and fades.
- Death: enemy spins 1 turn while flattening to 0.1 height, then pops
  out with 5 small star particles.
- Frozen tiles: light-blue translucent overlay plane with a slow
  animated ripple (vertex offset) and occasional bubble sprite.
- Spike: spikes (cones) rise out of ground on each tick and sink back.

Lighting: one hemisphere light + one directional light with soft
shadows; `MeshToonMaterial` on placeholders and on loaded models.

## 5. Model contract (Blender)

Full details in `docs/model-contract.md`. Summary:

- Format `.glb`, exported from Blender with Apply Modifiers, +Y up.
- Location `client/public/models/<name>.glb`. Missing file → placeholder + console warning.
- Names: `tower_crossbow`, `tower_spike`, `tower_cannon`, `tower_frozen`,
  `troll_scout`, `troll_brute`, `troll_bat`, `troll_boss`,
  `decor_tree`, `decor_rock`, `decor_cactus`, `decor_reed`.
- Scale: 1 unit = 1 m, tile = 2×2 m. Tower ≈ 1.6 m wide, 2–3 m tall. Scout ≈ 1 m, Boss ≈ 3 m.
- Origin at bottom centre.
- Optional child object `Turret` (rotates toward target) containing an Empty named `Muzzle` (projectile spawn).
- Optional animation clips `idle`, `shoot`, `walk`, `die`. Used if present, else procedural squash-stretch.
- Simple Principled BSDF colours or vertex colours; game applies toon shading.

`ModelLibrary.load(name)` returns `{ scene, turret?, muzzle?, clips }`
either from the glb or from a procedural placeholder builder with the
same shape (placeholders also expose a `Turret`/`Muzzle`).

## 6. Server and highscores

Express (Node 24) + better-sqlite3.

Table `highscores(id INTEGER PK, name TEXT, map TEXT, score INTEGER, wave INTEGER, created_at TEXT)`.

- `GET /api/highscores?map=<id>&limit=10` → `[{name, score, wave, created_at}]`, ordered by score desc. `limit` clamped 1–50.
- `POST /api/highscores` body `{name, map, score, wave}`. Validation:
  name trimmed, 1–16 chars; map one of the known ids; score and wave
  non-negative integers. Rate limit 5 POST / minute / IP (in-memory).
  Returns `{ok:true, rank}`.
- `GET /api/health` → `{ok:true}`.

Config via env: `PORT` (default 3000), `DB_PATH` (default `server/data/highscores.db`).
Server serves `client/dist` statically with SPA fallback to `index.html`.

Cloudpanel deployment: `npm ci && npm run build && npm start`; Cloudpanel
supplies `PORT`.

## 7. UI and i18n

HUD (top bar): gold, score, lives, wave x/20 (or "Endless N"), Next wave
button with countdown, speed toggle (1×/2×), auto-wave toggle.
Bottom/side: BuildPanel. Overlays: main menu with 4 map cards (theme
colour + short description + personal best from localStorage),
pause menu, game over / map cleared dialog with score submit form,
highscore table per map.

All user-visible strings come from `client/src/i18n/en.json` through
`t(key, params)`. Adding `da.json` and a language switch later needs no
other code change.

## 8. Error handling

- Missing/invalid `.glb` → placeholder, `console.warn`, game continues.
- Highscore API unreachable → scores saved in localStorage queue, list
  shows "offline" badge; queue is retried on next load.
- Invalid map JSON → validator throws a descriptive error at load; the
  menu shows the map as unavailable rather than crashing the game.
- WebGL unavailable → friendly message instead of a blank page.

## 9. Testing

- Vitest, `client/src/game/**/*.test.js`: enemy path following and
  speed on frozen tiles, tower targeting (first-in-range, flying rules),
  damage and splash, spike ticks, frozen tile recomputation on
  build/upgrade/sell, economy (costs, refund 70 %, wave bonus, early
  wave bonus), wave completion detection, endless generator budget,
  map validator on all four shipped maps plus deliberately broken maps.
- Supertest on `server/`: GET/POST happy paths, validation failures,
  rate limit, limit clamping, using a temp DB path.
- Manual: `npm run dev` for the Vite server with API proxy to the
  Express server; play each map end-to-end.

## 10. Out of scope for v1 (later)

More tower types, hero units, tower targeting mode selection, sound
design beyond a few placeholder effects, Danish translation file,
accounts/login, mobile-specific UI layout.
