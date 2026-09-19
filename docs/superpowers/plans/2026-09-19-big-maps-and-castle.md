# Big Maps and the 3×3 Castle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two committed 100×100 maps with interval-timed stacking waves, a 3×3 castle footprint shared by every map, a detailed castle model with a princess troll and a wind-animated flag, and rendering/camera that scale to big maps.

**Architecture:** The pure simulation (`client/src/game/`) gains a `C` tile type, footprint validation and a wave interval timer. A Node script (`scripts/generate-map.mjs`) produces map JSON that goes through the normal `validateMap`. The render layer switches tiles to `InstancedMesh`, scales fog/shadow/camera by map extent, orients the castle towards its road and animates a mesh named `Flag`. The castle model is built in Blender (done by the controller, not a subagent).

**Tech Stack:** Three.js r186, Vite, Vitest, Node 22 (`node:fs`, `node:path`), Blender 5.2 via MCP.

**Spec:** `docs/superpowers/specs/2026-09-19-big-maps-and-castle-design.md`

## Global Constraints
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `client/src/game/` must not import `three` or touch the DOM.
- UI copy goes through `t(key)` from `client/src/i18n/en.json`; no hard-coded English in UI code.
- Run `npm test` (Vitest, root) before every commit; all tests green.
- Tile chars are `.RWDC`; tile (tx,ty) centre is `((tx+0.5)*2, (ty+0.5)*2)`; `TILE_TOP = 0.12`; road top = 0.
- Do not modify `client/public/models/*.glb` or `blender/` (the controller does the model).

---

### Task 1: Castle tile type, footprint validation and the four existing maps

**Files:**
- Modify: `client/src/game/Grid.js` (TILE constant)
- Modify: `client/src/game/validateMap.js`
- Modify: `client/src/game/validateMap.test.js`
- Modify: `client/src/game/testMap.js`
- Modify: `client/src/data/maps/green.json`, `snow.json`, `desert.json`, `water.json`

**Interfaces:**
- Produces: `TILE.CASTLE === 'C'`; `validateMap` accepts `C` and enforces the 3×3 footprint rule.

- [ ] **Step 1: Write the failing tests** — append to `client/src/game/validateMap.test.js` (read the file first and follow its helper style; it uses `makeTestMap`):

```js
describe('castle footprint', () => {
  it('accepts C tiles around the base', () => {
    const map = makeTestMap({
      width: 7,
      height: 3,
      tiles: ['....CCC', 'RRRRRRC', '....CCC'],
      paths: [[[0, 1], [5, 1]]],
      base: [5, 1],
    });
    expect(validateMap(map, enemies)).toBe(true);
  });

  it('rejects a buildable tile inside the footprint', () => {
    const map = makeTestMap({
      width: 7,
      height: 3,
      tiles: ['....C.C', 'RRRRRRC', '....CCC'],
      paths: [[[0, 1], [5, 1]]],
      base: [5, 1],
    });
    expect(() => validateMap(map, enemies)).toThrow(/footprint/);
  });

  it('rejects a base whose footprint leaves the map', () => {
    const map = makeTestMap({ tiles: ['....CC', 'RRRRRR', '....CC'], base: [5, 1], paths: [[[0, 1], [5, 1]]] });
    expect(() => validateMap(map, enemies)).toThrow(/footprint/);
  });
});
```

Also update `client/src/game/testMap.js` so the default test map has a valid footprint (every other test keeps working):

```js
    width: 7,
    height: 3,
    tiles: ['....CCC', 'RRRRRRC', '....CCC'],
    paths: [[[0, 1], [5, 1]]],
    base: [5, 1],
```

Check `client/src/game/*.test.js` for tests that rely on width 6 or on tile (5,0)/(5,2) being buildable (grep for `buildTower(` with x ≥ 4 and for `width`), and adjust those coordinates to buildable tiles (x ≤ 3) — keep their intent.

- [ ] **Step 2: Run tests** — `npm test` → the three new tests fail (`C` invalid / no footprint check).

- [ ] **Step 3: Implement** — in `Grid.js`: `export const TILE = { BUILDABLE: '.', ROAD: 'R', WATER: 'W', DECOR: 'D', CASTLE: 'C' };`. In `validateMap.js`: `const TILE_CHARS = '.RWDC';` and after the base check add:

```js
  for (let y = by - 1; y <= by + 1; y++) {
    for (let x = bx - 1; x <= bx + 1; x++) {
      if (!inBounds(x, y)) fail('castle footprint (3x3 around base) leaves the map');
      const c = tile(x, y);
      if (c !== 'C' && c !== 'R') fail(`castle footprint tile ${x},${y} must be C or R`);
    }
  }
```

- [ ] **Step 4: Update the four maps** exactly as the spec §3 says (base moves one tile in where needed; footprint tiles become `C` except the base tile and the single approach road tile; path end waypoints updated). Resulting rows (verify by printing):
  - green rows 1–3: `............RCCC`? No — write them out: row 1 `.............CCC`, row 2 `............RRRC`, row 3 `............RCCC`; base `[14,2]`; path `[[0,5],[5,5],[5,9],[12,9],[12,2],[14,2]]`.
  - snow rows 9–11: row 9 `.CCC.........R..`, row 10 `.CRRRRRRRRRRRR..`, row 11 `.CCC............`; base `[2,10]`; path unchanged.
  - desert rows 3–5: row 3 `........D....CCC`, row 4 `......RRRRRRRRRC`, row 5 `......R......CCC`; base `[14,4]`; path `[[0,6],[6,6],[6,4],[14,4]]`.
  - water rows 5–7: row 5 `....R......D.CCC`, row 6 `....RRRRRRRRRRRC`, row 7 `WW.......R...CCC`; base `[14,6]`; both paths end `[14,6]`.
  Each map must pass `validateMap` — add a test in `validateMap.test.js` that imports the four JSON files and validates them.

- [ ] **Step 5: Run tests** — `npm test` → all green.

- [ ] **Step 6: Commit** — `git add -A client/src/game client/src/data/maps && git commit -m "feat(game): castle footprint tile type and 3x3 footprint on every map"` (+ trailer).

---

### Task 2: Interval-timed waves

**Files:**
- Modify: `client/src/game/Game.js`
- Modify: `client/src/game/Game.test.js`
- Modify: `client/src/ui/Hud.js:46-49`

**Interfaces:**
- Produces: `game.waveInterval` (number|null), `game.waveTimer` (number|null).

- [ ] **Step 1: Failing tests** — append to `Game.test.js`:

```js
describe('interval waves', () => {
  it('starts the next wave on the interval while the previous one is still running', () => {
    const g = makeGame({ modifiers: { frostBonus: 1, waveInterval: 5 } });
    const started = vi.fn();
    g.on('wave:started', started);
    g.startNextWave();
    expect(g.waveTimer).toBe(5);
    run(g, 4.9);
    expect(g.wave).toBe(1);
    run(g, 0.2);
    expect(g.wave).toBe(2);
    expect(started).toHaveBeenLastCalledWith({ wave: 2, early: true, endless: false });
    expect(g.waveTimer).toBeCloseTo(5, 0);
  });

  it('resets the timer on a manual start and has no timer without the modifier', () => {
    const g = makeGame({ modifiers: { frostBonus: 1, waveInterval: 5 } });
    g.startNextWave();
    run(g, 3);
    g.startNextWave();
    expect(g.waveTimer).toBe(5);
    const plain = makeGame();
    plain.startNextWave();
    expect(plain.waveTimer).toBeNull();
    run(plain, 30);
    expect(plain.wave).toBe(1);
  });

  it('stops the timer once every wave has been started', () => {
    const g = makeGame({ modifiers: { frostBonus: 1, waveInterval: 0.5 } });
    g.startNextWave();
    run(g, 12);
    expect(g.wave).toBe(20);
    expect(g.waveTimer).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — fails (`waveTimer` undefined).

- [ ] **Step 3: Implement** in `Game.js`: constructor adds `this.waveInterval = map.modifiers?.waveInterval ?? null; this.waveTimer = null;`. In `startNextWave()` after `this.state = 'running';` add `this.waveTimer = this.waveInterval !== null && this.canStartWave ? this.waveInterval : null;`. In `update(dt)` right before the idle-countdown block:

```js
    if (this.waveTimer !== null) {
      if (!this.canStartWave) this.waveTimer = null;
      else {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startNextWave();
      }
    }
```

Note `startNextWave` bumps `wave` first, so `canStartWave` inside it already reflects the new count; when wave 20 has just started it becomes false and the timer is nulled. `#end()` also sets `this.waveTimer = null`.

- [ ] **Step 4: HUD** — in `Hud.js` replace the label block with:

```js
    let nextLabel;
    if (game.waveTimer !== null) nextLabel = t('hud.nextWaveIn', { seconds: Math.ceil(game.waveTimer) });
    else if (game.state === 'running') nextLabel = t('hud.callEarly');
    else if (game.countdown !== null && game.autoWave) nextLabel = t('hud.nextWaveIn', { seconds: Math.ceil(game.countdown) });
    else nextLabel = t('hud.nextWave');
```

- [ ] **Step 5: Run** `npm test` → green. **Step 6: Commit** `feat(game): interval-timed stacking waves via modifiers.waveInterval`.

---

### Task 3: Map generator script and the two 100×100 maps

**Files:**
- Create: `scripts/generate-map.mjs`
- Create: `scripts/generate-map.test.js`
- Create: `client/src/data/maps/vast.json`, `client/src/data/maps/dunes.json` (generated)
- Modify: `client/src/data/index.js`, `server/app.js:4`, `client/src/i18n/en.json`, `client/src/style.css:93-96`, `vitest.config.js` (include `scripts/**/*.test.js`), `README.md` (one paragraph on generating maps)

**Interfaces:**
- Produces: `export function generateMap({ seed, id, name, theme, description })` returning a map object; CLI writes JSON.

- [ ] **Step 1: Failing test** `scripts/generate-map.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateMap } from './generate-map.mjs';
import { validateMap } from '../client/src/game/validateMap.js';
import enemies from '../client/src/data/enemies.json';

const opts = { seed: 7, id: 'vast', name: 'Vast Meadows', theme: 'green', description: 'Big.' };

describe('generateMap', () => {
  it('produces a valid 100x100 map with three paths from three different edges', () => {
    const map = generateMap(opts);
    expect(map.width).toBe(100);
    expect(map.height).toBe(100);
    expect(validateMap(map, enemies)).toBe(true);
    expect(map.paths).toHaveLength(3);
    const edge = ([x, y]) => (y === 0 ? 'N' : y === 99 ? 'S' : x === 0 ? 'W' : 'E');
    expect(new Set(map.paths.map((p) => edge(p[0]))).size).toBe(3);
    expect(map.modifiers.waveInterval).toBe(45);
    expect(map.waves).toHaveLength(20);
    expect(map.waves[0].spawns[0].count).toBe(9);
  });

  it('is deterministic per seed and different across seeds', () => {
    expect(generateMap(opts)).toEqual(generateMap(opts));
    expect(generateMap({ ...opts, seed: 8 }).tiles).not.toEqual(generateMap(opts).tiles);
  });

  it('keeps the castle footprint free of buildable tiles and decor', () => {
    const map = generateMap(opts);
    const [bx, by] = map.base;
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) expect('CR').toContain(map.tiles[y][x]);
  });
});
```

- [ ] **Step 2: Implement `scripts/generate-map.mjs`** (ES module, runnable as CLI):

```js
#!/usr/bin/env node
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SIZE = 100;
const EDGES = ['N', 'S', 'E', 'W'];

function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

function inFootprint(x, y, [bx, by]) {
  return Math.abs(x - bx) <= 1 && Math.abs(y - by) <= 1;
}

/** One axis-aligned random walk from `edge` to `base`. Returns waypoints or null if it wandered into the footprint early. */
function walkPath(rng, edge, base) {
  const [bx, by] = base;
  let x = edge === 'W' ? 0 : edge === 'E' ? SIZE - 1 : randInt(rng, 10, SIZE - 11);
  let y = edge === 'N' ? 0 : edge === 'S' ? SIZE - 1 : randInt(rng, 10, SIZE - 11);
  const points = [[x, y]];
  const tiles = new Set();
  const mark = (x0, y0, x1, y1) => {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    for (let cx = x0, cy = y0; ; cx += dx, cy += dy) {
      if (inFootprint(cx, cy, base) && !(cx === bx && cy === by)) {
        // only the final approach may touch the footprint
        if (!(cx + dx === bx && cy + dy === by) && !(cx === bx || cy === by)) return false;
      }
      tiles.add(`${cx},${cy}`);
      if (cx === x1 && cy === y1) return true;
    }
  };
  for (let guard = 0; guard < 200; guard++) {
    if (x === bx && y === by) break;
    const remX = bx - x;
    const remY = by - y;
    let axis = Math.abs(remX) >= Math.abs(remY) ? 'x' : 'y';
    if (rng() < 0.25 && (axis === 'x' ? remY : remX) !== 0) axis = axis === 'x' ? 'y' : 'x';
    const rem = axis === 'x' ? remX : remY;
    let step;
    if (rng() < 0.2) {
      const back = -Math.sign(rem || 1) * randInt(rng, 3, 8);
      const nx = axis === 'x' ? x + back : x;
      const ny = axis === 'y' ? y + back : y;
      step = nx >= 3 && nx <= SIZE - 4 && ny >= 3 && ny <= SIZE - 4 ? back : 0;
    }
    if (!step) step = Math.sign(rem) * Math.min(Math.abs(rem), randInt(rng, 4, 14));
    if (step === 0) continue;
    const nx = axis === 'x' ? x + step : x;
    const ny = axis === 'y' ? y + step : y;
    const isFinal = nx === bx && ny === by;
    // reject any segment that enters the footprint unless it is the final approach along the base row/column
    for (let cx = x, cy = y; ; cx += Math.sign(nx - x), cy += Math.sign(ny - y)) {
      if (inFootprint(cx, cy, base) && !isFinal) return null;
      if (cx === nx && cy === ny) break;
    }
    mark(x, y, nx, ny);
    x = nx;
    y = ny;
    points.push([x, y]);
  }
  if (x !== bx || y !== by) return null;
  return { points, tiles };
}

function pickEdges(rng) {
  const edges = [...EDGES];
  const out = [];
  while (out.length < 3) out.push(edges.splice(randInt(rng, 0, edges.length - 1), 1)[0]);
  return out;
}

function waves(pathCount) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const green = JSON.parse(readFileSync(path.join(here, '../client/src/data/maps/green.json'), 'utf8'));
  return green.waves.map((w, wi) => ({
    spawns: w.spawns.map((s, gi) => ({ ...s, count: Math.ceil(s.count * 1.5), path: (wi + gi) % pathCount })),
  }));
}

export function generateMap({ seed, id, name, theme, description = '' }) {
  const rng = makeRng(seed);
  const base = [randInt(rng, 35, 64), randInt(rng, 35, 64)];
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const road = new Set();
  const paths = [];
  for (const edge of pickEdges(rng)) {
    let p = null;
    for (let attempt = 0; attempt < 50 && !p; attempt++) p = walkPath(rng, edge, base);
    if (!p) throw new Error(`seed ${seed}: could not route a path from edge ${edge}; try another seed`);
    paths.push(p.points);
    for (const k of p.tiles) road.add(k);
  }
  for (const k of road) {
    const [x, y] = k.split(',').map(Number);
    grid[y][x] = 'R';
  }
  const [bx, by] = base;
  for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (grid[y][x] !== 'R') grid[y][x] = 'C';

  const nearRoadOrCastle = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const c = grid[y + dy]?.[x + dx];
      if (c === 'R' || c === 'C') return true;
    }
    return false;
  };
  const blobs = randInt(rng, 6, 10);
  for (let b = 0; b < blobs; b++) {
    let x = randInt(rng, 5, SIZE - 6);
    let y = randInt(rng, 5, SIZE - 6);
    const n = randInt(rng, 15, 40);
    for (let i = 0; i < n; i++) {
      if (grid[y][x] === '.' && !nearRoadOrCastle(x, y)) grid[y][x] = 'W';
      const d = randInt(rng, 0, 3);
      x = Math.max(1, Math.min(SIZE - 2, x + (d === 0 ? 1 : d === 1 ? -1 : 0)));
      y = Math.max(1, Math.min(SIZE - 2, y + (d === 2 ? 1 : d === 3 ? -1 : 0)));
    }
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (grid[y][x] === '.' && !nearRoadOrCastle(x, y) && rng() < 0.015) grid[y][x] = 'D';
  }

  return {
    id,
    name,
    theme,
    description,
    width: SIZE,
    height: SIZE,
    tiles: grid.map((row) => row.join('')),
    paths,
    base,
    startGold: 400,
    modifiers: { frostBonus: 1.0, waveInterval: 45 },
    waves: waves(paths.length),
  };
}

function cli() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((e) => e.length));
  for (const k of ['id', 'name', 'theme', 'seed']) if (!args[k]) { console.error(`missing --${k}`); process.exit(1); }
  const map = generateMap({ ...args, seed: Number(args.seed) });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const out = path.join(here, '../client/src/data/maps', `${map.id}.json`);
  writeFileSync(out, JSON.stringify(map, null, 1) + '\n');
  console.log(`wrote ${out}: base ${map.base}, paths ${map.paths.map((p) => p.length).join('/')} waypoints`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli();
```

Note on `walkPath`: the inner `mark` helper's footprint test is redundant with the pre-check loop; keep the pre-check (segment rejected → path restarts) and simplify `mark` to only collect tiles. Make the final approach explicit: when the remaining distance on one axis is 0 and the other axis is being closed, the segment ends exactly on the base tile — `Math.min(Math.abs(rem), …)` guarantees no overshoot, and the loop continues until both are 0.

- [ ] **Step 3: Vitest config** — `include: ['client/src/**/*.test.js', 'server/**/*.test.js', 'scripts/**/*.test.js']`.

- [ ] **Step 4: Run tests** — iterate on the generator until the three tests pass (if seed 7 cannot route, change the test's seed and the map's seed together; record the seeds used in the commit message).

- [ ] **Step 5: Generate the two maps**:

```bash
node scripts/generate-map.mjs --id vast --name "Vast Meadows" --theme green --seed 7 --description "A huge open valley with three long roads. Waves keep coming on a timer."
node scripts/generate-map.mjs --id dunes --name "Endless Dunes" --theme desert --seed 23 --description "Three caravan roads across an enormous desert. The waves never wait."
```

- [ ] **Step 6: Register** — `client/src/data/index.js` imports `vast` and `dunes`, adds them to `MAPS` and `MAP_ORDER` (after `water`); `server/app.js` `MAP_IDS = ['green', 'snow', 'desert', 'water', 'vast', 'dunes']`; `en.json` adds `map.vast.name`, `map.vast.description`, `map.dunes.name`, `map.dunes.description` (same text as the CLI descriptions); `style.css` adds `.map-card[data-theme="vast"] { background: #a9dd8f; }` and `.map-card[data-theme="dunes"] { background: #f5d38a; }`. README: a short "Generating maps" paragraph with the command.

- [ ] **Step 7: Run** `npm test` → green (server tests still pass). **Step 8: Commit** `feat(maps): seeded 100x100 map generator and the Vast Meadows / Endless Dunes maps`.

---

### Task 4: MapRenderer — instanced tiles, castle tiles, castle orientation, flag animation, bigger placeholder

**Files:**
- Modify: `client/src/render/MapRenderer.js`
- Modify: `client/src/render/placeholders.js:215-228`

**Interfaces:**
- Consumes: `TILE.CASTLE`; a castle instance may contain a mesh named `Flag` (pole edge at local x = 0, cloth extending along +X).
- Produces: `MapRenderer.pickTile(raycaster)` unchanged signature; `MapRenderer.update(dt)` animates the flag.

- [ ] **Step 1: Instanced tiles** — replace `#buildTiles` body: build the same `box` and materials plus `castle: new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.road).multiplyScalar(0.85) })`. Count tiles per kind first, then create one `THREE.InstancedMesh(box, mat, count)` per kind with `castShadow = kind !== 'water'`, `receiveShadow = true`, fill matrices with `new THREE.Matrix4().makeTranslation(...)` at the same positions/heights as before (castle at top 0), store `mesh.userData.tiles = []` with `{x, y, type}` per instance index, call `instanceMatrix.needsUpdate = true`, and push each instanced mesh to `this.groundMeshes` and `this.group`. Keep the slab.

- [ ] **Step 2: pickTile** —

```js
  pickTile(raycaster) {
    const hits = raycaster.intersectObjects(this.groundMeshes, false);
    if (!hits.length) return null;
    const { object, instanceId } = hits[0];
    return object.userData.tiles[instanceId] ?? null;
  }
```

- [ ] **Step 3: Castle orientation and flag** — in `#buildLandmarks` after placing the castle: take `this.map.paths[0]`, its last two waypoints `[px, py]` (second-to-last) and `[bx, by]`, and set `base.rotation.y = Math.atan2(px - bx, py - by)` (gate +Z looks back down the road). Then:

```js
    this.flag = base.getObjectByName('Flag') ?? null;
    if (this.flag?.isMesh) {
      this.flag.geometry = this.flag.geometry.clone();
      this.flagRest = this.flag.geometry.attributes.position.array.slice();
      this.flag.geometry.computeBoundingBox();
      const bb = this.flag.geometry.boundingBox;
      this.flagX0 = bb.min.x;
      this.flagWidth = Math.max(1e-3, bb.max.x - bb.min.x);
      this.ownedGeometries.push(this.flag.geometry);
    }
```

In `update(dt)` add the wave (spec §5):

```js
    if (this.flag) {
      const pos = this.flag.geometry.attributes.position;
      const rest = this.flagRest;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const f = (x - this.flagX0) / this.flagWidth; // 0 at the pole, 1 at the free end
        pos.array[i * 3 + 1] = rest[i * 3 + 1] + Math.sin(x * 6 - this.time * 7) * 0.06 * f;
        pos.array[i * 3 + 2] = rest[i * 3 + 2] + Math.sin(x * 4 - this.time * 5) * 0.1 * f;
      }
      pos.needsUpdate = true;
      this.flag.geometry.computeVertexNormals();
    }
```

Make sure `this.flag`'s material is `DoubleSide` (`this.flag.material = this.flag.material.clone(); this.flag.material.side = THREE.DoubleSide;` and push it to `ownedMaterials`).

- [ ] **Step 4: Placeholder castle** — replace `base_castle()` in `placeholders.js` with a 3×3-tile version: wall box 5.0×1.6×5.0 (`y: 0.8`), four corner cylinders r 0.5 h 2.6 at (±2.2, 1.3, ±2.2) with red cones r 0.62 h 0.8 at y 2.9, a keep box 2.0×3.0×2.0 at (0, 1.5, 0), a gate box 1.2×1.4×0.3 in `C.woodDark` at (0, 0.7, 2.5), a pole cylinder r 0.04 h 1.6 at (0, 3.8, 0), and the flag: `new THREE.PlaneGeometry(0.9, 0.5, 16, 8)` translated by `(0.45, 0, 0)` so the pole edge is at x = 0, `toon(C.gold, { side: THREE.DoubleSide })`, named `Flag`, positioned at (0, 4.3, 0). Keep everything centred so the origin is bottom centre.

- [ ] **Step 5: Manual check** — `npm run dev -w client` is already served on 5173 by the controller; do not start another server. Verify by reading the code twice; the controller checks the browser.

- [ ] **Step 6: Run** `npm test` → green. **Step 7: Commit** `feat(render): instanced tiles, castle plaza tiles, road-facing castle and a waving Flag`.

---

### Task 5: Scale scene, fog, shadows and camera to the map

**Files:**
- Modify: `client/src/render/SceneManager.js` (`setTheme`, `focusSun`)
- Modify: `client/src/render/CameraRig.js`
- Modify: `client/src/render/GameSession.js:17-24`

- [ ] **Step 1:** `setTheme({ sky, fog }, extent = 16)`: fog `new THREE.Fog(color, Math.max(45, 2.5 * extent), Math.max(110, 6 * extent))`; `this.camera.far = Math.max(300, 8 * extent); this.camera.updateProjectionMatrix();`.
- [ ] **Step 2:** `focusSun(cx, cz, extent = 16)`: `const half = Math.max(30, 1.15 * extent); Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: Math.max(120, 6 * extent) }); this.sun.position.set(cx + 0.6 * extent, 1.2 * extent + 20, cz + 0.45 * extent); const size = extent > 40 ? 4096 : 2048; if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }` then target + `updateProjectionMatrix()` as now.
- [ ] **Step 3:** `CameraRig`: `c.maxDistance = Math.max(45, 2.6 * extent);` (keep `minDistance = 10`, `maxTargetRadius = extent`).
- [ ] **Step 4:** `GameSession`: `sceneManager.setTheme(this.mapRenderer.theme, this.mapRenderer.extent); sceneManager.focusSun(this.mapRenderer.centerX, this.mapRenderer.centerZ, this.mapRenderer.extent);`.
- [ ] **Step 5:** `npm test` → green. Commit `feat(render): fog, shadows and camera range scale with map size`.

---

### Task 6 (controller, Blender): detailed 3×3 castle with princess and flag
Not for subagents. Build collection `base_castle` per spec §4 in `blender/troll-towers.blend`, export `client/public/models/base_castle.glb`, update `docs/model-contract.md` (size ~5.6 m, parts `Flag`, `Princess`). Verify in the browser on `?map=green` and `?map=vast`.

---

### Task 7: Docs and final check
- `README.md`: mention the two big maps and the generator command (if not done in Task 3), and the `C` tile in the map format description if the README documents tiles.
- `docs/model-contract.md` already updated in Task 6.
- Full `npm test`, `npm run build`, browser smoke test on `?map=vast` (waves start on the timer, castle faces the road, flag waves, arrows run on all three paths, zoom-out shows the whole map).
