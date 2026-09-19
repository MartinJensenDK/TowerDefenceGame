# Big Maps and the 3×3 Castle — Design

Extends the Troll Towers v1 design (`2026-09-19-tower-defence-design.md`).

## Goals
1. Two new fixed maps of 100×100 tiles, generated once by a seeded script and committed as JSON.
2. Waves on those maps start automatically on a fixed interval, stacking on screen.
3. The castle occupies 3×3 tiles, is the same detailed model on every map, has a princess troll and a flag waving in the wind.
4. Rendering, camera, fog and shadows scale to big maps.

## 1. Map generator (`scripts/generate-map.mjs`)
Usage: `node scripts/generate-map.mjs --id vast --name "Vast Meadows" --theme green --seed 7 --description "..."` writes `client/src/data/maps/<id>.json`. Deterministic for a seed (LCG RNG, same as MapRenderer's).

Algorithm (100×100):
- Base tile: random in x,y ∈ [35, 64].
- 3 paths from 3 distinct edges (chosen from N/S/E/W). A path is an axis-aligned random walk: start on the edge at a random coordinate in [10, 89]; repeat: pick the axis with the larger remaining distance to the base (with 25 % chance the other axis, i.e. a detour), step a random segment length 4–14 towards the base, never overshooting it; with 20 % chance the segment goes *away* from the base by 3–8 tiles if that stays inside [3, 96]. Stop when the base is reached; the last segments align exactly onto the base row/column then onto the base tile. Waypoints are the corners; every tile on the segments becomes `R`.
- Castle footprint: the 3×3 around the base. Every footprint tile not on a path becomes `C`. Paths may only enter the footprint on their final segment (the generator restarts a path that would cross the footprint earlier; max 50 attempts, then a different seed is required — the script exits 1 with a message).
- Water: 6–10 blobs (random-walk of 15–40 tiles) that avoid roads, the footprint and a 1-tile margin around them.
- Decor `D`: 1.5 % of remaining `.` tiles, never adjacent (8-neighbourhood) to a road.
- Waves: the 20-wave table from `green.json`, with `path` set per spawn group so groups rotate over the paths (`(waveIndex + groupIndex) % paths.length`), all counts multiplied by 1.5 (rounded up).
- Fields: `startGold: 400`, `modifiers: { frostBonus: 1.0, waveInterval: 45 }`.

Tests (`scripts/generate-map.test.js`, Vitest) call the exported `generateMap({ seed, id, name, theme, description })` and assert: `validateMap` passes; 3 paths starting on 3 different edges; the footprint is `C`/`R` only; deterministic for the same seed; different for different seeds.

Committed maps: `vast` (green, "Vast Meadows") and `dunes` (desert, "Endless Dunes"). Both are added to `MAPS`/`MAP_ORDER`, `server/app.js` `MAP_IDS`, `en.json` names/descriptions, and `style.css` card colours.

## 2. Timed waves (`modifiers.waveInterval`)
- `Game.waveInterval = map.modifiers?.waveInterval ?? null`, `Game.waveTimer = null`.
- `startNextWave()` sets `waveTimer = waveInterval` when `waveInterval` is set.
- `update(dt)`: if `waveTimer !== null` and `canStartWave`: `waveTimer -= dt`; at `<= 0` call `startNextWave()` (which stacks a new wave; `early` is true when other waves are still active, so the +10 % early bonus applies as for a manual early call). When `canStartWave` becomes false (all 20 started, not endless) the timer is set to null.
- The existing idle `countdown`/`autoWave` logic is untouched and still runs on maps without `waveInterval`; on interval maps the idle countdown never auto-starts (`autoWave` stays available but the interval timer already covers it).
- HUD: when `game.waveTimer !== null` the next-wave button shows `hud.nextWaveIn` with `Math.ceil(waveTimer)`; clicking it still starts the wave at once (and resets the timer).
- Tests: timer counts down and starts wave 2 while wave 1 is still active; manual start resets the timer; no timer on maps without the modifier; timer stops after wave 20.

## 3. Castle footprint (`C` tiles)
- `TILE.CASTLE = 'C'` in `Grid.js`; `validateMap` accepts `C` and additionally requires: the 3×3 around the base is inside the map and contains only `C` or `R`.
- `C` is not buildable, not road (`isBuildable` and `isRoad` need no change).
- The four existing maps move the base one tile in from the edge where needed and mark the footprint:
  - green: base `[14,2]`; row 2 becomes `............RRRC` → actually footprint (13..15, 1..3): (13,2) `R`, (14,2) `R`, rest `C`; path end `[14,2]`.
  - snow: base stays `[2,10]`; footprint (1..3, 9..11): (3,10) `R`, (2,10) `R`, rest `C`; path end unchanged.
  - desert: base `[14,4]`; footprint (13..15, 3..5): (13,4) `R`, (14,4) `R`, rest `C`; path end `[14,4]`.
  - water: base `[14,6]`; footprint (13..15, 5..7): (13,6) `R`, (14,6) `R`, rest `C` (the `W` at (14,7) becomes `C`); both paths end `[14,6]`.
- MapRenderer draws `C` tiles at road height (0) in the theme's road colour darkened 15 % (a stone plaza under the castle). No decor on them.
- The castle model is placed on the base tile centre and rotated with `Math.atan2` so its gate (+Z) faces the direction the first path arrives from (from the path's second-to-last waypoint towards the base, i.e. the gate looks back down the road).

## 4. Castle model
Blender (`blender/troll-towers.blend`, collection `base_castle`), exported to `client/public/models/base_castle.glb`. Footprint ≈ 5.6 × 5.6 m (fits in 3×3 tiles = 6 m), origin bottom centre, gate on +Z:
- Curtain wall with crenellations, four round corner towers with red conical roofs, an arched gate with a portcullis and two small torches, a taller square keep in the centre with a balcony on the +Z side.
- `Princess` — an operator-style troll (from `tt_helpers`) in a pink dress with a small gold crown, standing on the balcony, waving.
- `Flag` — a plane on the keep's pole, 16×8 subdivisions, pinned at the pole edge (x = 0), extending along +X, ~0.9 × 0.5 m. Blue field with a gold troll-face blob.
- Model contract table updated: `base_castle.glb` ~5.6 m wide, parts `Flag`, `Princess`.

Placeholder `base_castle()` grows to the same footprint (a 5 m wall box, four towers, keep, pole, and a `Flag` plane with 16×8 segments) so the fallback matches the footprint.

## 5. Flag animation (Three.js)
`MapRenderer` finds the mesh named `Flag` in the castle instance, keeps a copy of its original positions and, in `update(dt)`, displaces each vertex: `y += sin(x·6 − t·7) · 0.06 · x/width` and `z += sin(x·4 − t·5) · 0.1 · x/width` (x measured from the pole edge, so the pole edge stays fixed and the free end waves most). Normals are recomputed each frame. Works for the placeholder and the glTF alike; if no `Flag` exists nothing happens.

## 6. Big-map rendering and camera
- Tiles: one `InstancedMesh` per material (ground A, ground B, road, water, castle). `pickTile` raycasts the instanced meshes and maps `instanceId` → tile via per-mesh arrays. Shadows: instanced ground receives and casts as before.
- `SceneManager.setTheme(theme, extent)`: fog near `max(45, 2.5·extent)`, far `max(110, 6·extent)`; camera far `max(300, 8·extent)`.
- `SceneManager.focusSun(cx, cz, extent)`: shadow camera half-size `max(30, 1.15·extent)`, sun placed at `(cx + 0.6·extent, 1.2·extent + 20, cz + 0.45·extent)`, shadow map 4096 when extent > 40.
- `CameraRig`: `maxDistance = max(45, 2.6·extent)`, `maxTargetRadius = extent`, initial position unchanged (`extent·1.3` up, `extent·1.25` back).
- Path preview spacing: arrows every 1.1 m as now (a 300-tile path ≈ 550 arrows; acceptable).
- Decor on big maps is capped by the generator (≈ 150 pieces).

## 7. Out of scope
Minimap, random maps at play time, camera panning with keys, castle damage states.
