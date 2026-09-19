# Troll Towers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Troll Towers", a cartoon 3D browser tower defence with 4 maps, 4 towers (3 levels each), 4 troll enemies, 20 waves + endless, orbit camera, and a Node/SQLite highscore server.

**Architecture:** A Vite + Three.js client where `client/src/game/` is pure, DOM-free, Three-free simulation code (tested with Vitest) that emits events; `client/src/render/` draws it with Three.js and `client/src/ui/` is an HTML overlay. An Express server serves the built client and a small highscore API backed by better-sqlite3.

**Tech Stack:** Node 24, npm workspaces, Vite, Three.js (ES modules, `three/addons`), Vitest, Express 5, better-sqlite3, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-19-tower-defence-design.md`

## Global Constraints

- Plain JavaScript ES modules everywhere (`"type": "module"`); no TypeScript, no framework.
- `client/src/game/**` must never import `three` or touch `window`/`document`.
- One grid tile = 2×2 world units (`TILE_SIZE = 2`); world x = east, world z = south, y = up. Tile `(tx, ty)` centre is at world `((tx+0.5)*2, 0, (ty+0.5)*2)`.
- Tile chars: `.` buildable, `R` road, `W` water, `D` decor.
- Exactly 20 authored waves per map; boss on waves 10 and 20; base has 20 lives.
- Sell refund is 70 % of gold invested (floored). Wave bonus is 20 gold and 50×wave score; early call adds 10 % of the score bonus.
- Enemy HP multiplier per wave: `1 + 0.06 × (wave − 1)`.
- Frozen tiles: speed multiplier `max(0.1, 1 − (1 − slow) × frostBonus)`; flying enemies ignore it.
- All user-facing strings go through `t(key)` from `client/src/i18n/en.json`. No hard-coded UI text.
- Model file names: `tower_crossbow`, `tower_spike`, `tower_cannon`, `tower_frozen`, `troll_scout`, `troll_brute`, `troll_bat`, `troll_boss`, `decor_tree`, `decor_rock`, `decor_cactus`, `decor_reed`, `base_castle`, `spawn_gate` in `client/public/models/<name>.glb`; missing files fall back to placeholders.
- Highscore API: `GET /api/highscores?map=&limit=` (limit clamped 1–50), `POST /api/highscores {name(1–16 chars), map, score, wave}`, 5 POST/min/IP, `GET /api/health`.
- Commit after every task with a conventional message ending in `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Run commands from the repo root `/home/ubuntu/Desktop/Game - TowerDefence` (note the spaces: quote the path).

---

## File structure

```
package.json                     npm workspaces root; scripts dev/build/start/test
vitest.config.js                 runs client + server tests
.gitignore
client/
  package.json                   three, vite
  vite.config.js                 dev proxy /api -> :3000
  index.html                     canvas + UI overlay containers
  src/
    main.js                      bootstrap: i18n, menu, start game
    style.css                    cartoon UI styling
    data/index.js                exports TOWER_DEFS, ENEMY_DEFS, MAPS, MAP_ORDER
    data/towers.json             tower definitions (3 levels each)
    data/enemies.json            troll definitions
    data/maps/{green,snow,desert,water}.json
    game/events.js               Emitter
    game/validateMap.js          map validator
    game/Grid.js                 tiles, occupancy, frozen tiles, coordinate helpers
    game/Enemy.js                path following, hp
    game/Tower.js                targeting, cooldowns, upgrade/sell math
    game/Economy.js              gold, score, lives
    game/Wave.js                 schedules, endless generator, formulas
    game/Game.js                 the simulation facade, emits events
    game/testMap.js              tiny map used by tests
    i18n/en.json, i18n/i18n.js   t()
    render/SceneManager.js       renderer, lights, loop
    render/CameraRig.js          OrbitControls limits
    render/placeholders.js       procedural placeholder models
    render/ModelLibrary.js       glb loading with placeholder fallback
    render/MapRenderer.js        tiles, decor, frozen overlay, picking
    render/EnemyView.js          per-enemy visuals
    render/TowerView.js          per-tower visuals, ghost preview
    render/Effects.js            projectiles, hit sprites, death bursts
    render/GameSession.js        binds Game events to views
    ui/InputController.js        click vs drag, hover
    ui/Hud.js
    ui/BuildPanel.js
    ui/GameScreen.js             one playthrough: game + session + hud + panel + input
    ui/Menu.js
    ui/Dialogs.js                end (win/loss) and pause dialogs
    ui/Highscores.js             API client + offline queue + list rendering
    ui/html.js                   escapeHtml
  public/models/.gitkeep
.claude/launch.json              dev server entry for the Browser pane (optional)
server/
  package.json                   express, better-sqlite3, supertest
  db.js                          openDb(path)
  app.js                         createApp({db, staticDir})
  index.js                       listen
  app.test.js
docs/model-contract.md
README.md
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.js`, `client/src/style.css`, `client/public/models/.gitkeep`, `server/package.json`, `server/index.js`

**Interfaces:**
- Produces: root scripts `npm run dev`, `npm run build`, `npm start`, `npm test`; workspaces `client` and `server`.

- [ ] **Step 1: Create root package.json, vitest config and .gitignore**

`package.json`:
```json
{
  "name": "troll-towers",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["client", "server"],
  "scripts": {
    "dev": "concurrently -k -n client,server \"npm run dev -w client\" \"npm run dev -w server\"",
    "build": "npm run build -w client",
    "start": "node server/index.js",
    "test": "vitest run"
  }
}
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['client/src/**/*.test.js', 'server/**/*.test.js'],
    passWithNoTests: true,
    environment: 'node',
  },
});
```

`.gitignore`:
```
node_modules/
client/dist/
server/data/*.db
server/data/*.db-*
.env
```

- [ ] **Step 2: Create client package**

`client/package.json`:
```json
{
  "name": "client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
```

`client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Troll Towers</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="ui">
      <div id="hud" hidden></div>
      <div id="build-panel" hidden></div>
      <div id="menu" hidden></div>
      <div id="dialog" hidden></div>
      <div id="fatal" hidden></div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`client/src/style.css`:
```css
:root {
  --ink: #2b1d0e;
  --paper: #fff7e6;
  --accent: #ffb347;
  --accent-2: #6fd36f;
  --danger: #ff6b6b;
  --sky: #9ad7ff;
  font-family: "Trebuchet MS", "Comic Sans MS", "Segoe UI", sans-serif;
}
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--sky); }
#game { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#ui { position: fixed; inset: 0; pointer-events: none; color: var(--ink); }
#ui > * { pointer-events: auto; }
[hidden] { display: none !important; }
#fatal { position: absolute; inset: 0; display: grid; place-items: center; background: var(--paper); font-size: 1.3rem; padding: 2rem; text-align: center; }
```

`client/src/main.js` (placeholder bootstrap, replaced in Task 15):
```js
console.log('Troll Towers booting');
```

Create empty file `client/public/models/.gitkeep`.

- [ ] **Step 3: Create server package**

`server/package.json`:
```json
{
  "name": "server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "node --watch index.js"
  }
}
```

`server/index.js` (replaced in Task 13):
```js
console.log('server placeholder');
```

- [ ] **Step 4: Install dependencies**

Run from repo root:
```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm install -D vitest concurrently && npm install -w client three && npm install -w client -D vite && npm install -w server express better-sqlite3 && npm install -w server -D supertest
```
Expected: `node_modules/` created at root, no errors. `better-sqlite3` downloads a prebuilt binary for Node 24 (if it compiles from source instead, that is also fine as long as it exits 0).

- [ ] **Step 5: Verify build and test runner**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run build && ls client/dist/index.html && npm test`
Expected: Vite prints `✓ built in …`, `client/dist/index.html` exists, vitest prints `No test files found` and exits 0.

- [ ] **Step 6: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add -A && git commit -m "chore: scaffold npm workspaces, vite client, express server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Event emitter

**Files:**
- Create: `client/src/game/events.js`
- Test: `client/src/game/events.test.js`

**Interfaces:**
- Produces: `class Emitter { on(name, fn) → unsubscribe(); off(name, fn); emit(name, payload) }`

- [ ] **Step 1: Write the failing test**

`client/src/game/events.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { Emitter } from './events.js';

describe('Emitter', () => {
  it('calls listeners with the payload', () => {
    const em = new Emitter();
    const fn = vi.fn();
    em.on('ping', fn);
    em.emit('ping', { a: 1 });
    expect(fn).toHaveBeenCalledWith({ a: 1 });
  });

  it('returns an unsubscribe function', () => {
    const em = new Emitter();
    const fn = vi.fn();
    const off = em.on('ping', fn);
    off();
    em.emit('ping');
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw when no listeners exist', () => {
    const em = new Emitter();
    expect(() => em.emit('nothing', 1)).not.toThrow();
  });

  it('lets a listener unsubscribe itself during emit', () => {
    const em = new Emitter();
    const calls = [];
    const off = em.on('x', () => { calls.push('a'); off(); });
    em.on('x', () => calls.push('b'));
    em.emit('x');
    em.emit('x');
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/events.test.js`
Expected: FAIL, cannot find module `./events.js`.

- [ ] **Step 3: Implement**

`client/src/game/events.js`:
```js
/** Minimal synchronous event emitter used by the simulation. */
export class Emitter {
  #listeners = new Map();

  on(name, fn) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.#listeners.get(name)?.delete(fn);
  }

  emit(name, payload) {
    const set = this.#listeners.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/events.test.js`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/events.js client/src/game/events.test.js && git commit -m "feat(game): add event emitter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Tower and enemy definitions

**Files:**
- Create: `client/src/data/towers.json`, `client/src/data/enemies.json`
- Test: `client/src/data/defs.test.js`

**Interfaces:**
- Produces: tower def shape `{ name, kind: 'projectile'|'area'|'freeze', hitsFlying, hitsGround, projectile?, levels: [{cost, fireRate?, damage?, range?, splashRadius?, splashFactor?, tickInterval?, freezeRadius?, slow?}] }`; enemy def shape `{ name, hp, speed, gold, score, flying, livesCost }`. Range is in world units, `freezeRadius` in tiles.

- [ ] **Step 1: Write the failing test**

`client/src/data/defs.test.js`:
```js
import { describe, it, expect } from 'vitest';
import towers from './towers.json';
import enemies from './enemies.json';

describe('tower definitions', () => {
  it('has the four towers with three levels each', () => {
    expect(Object.keys(towers).sort()).toEqual(['cannon', 'crossbow', 'frozen', 'spike']);
    for (const def of Object.values(towers)) {
      expect(def.levels).toHaveLength(3);
      for (const lvl of def.levels) expect(lvl.cost).toBeGreaterThan(0);
    }
  });

  it('gives projectile towers fireRate/damage/range and freeze towers freezeRadius/slow', () => {
    for (const lvl of towers.crossbow.levels) {
      expect(lvl.fireRate).toBeGreaterThan(0);
      expect(lvl.damage).toBeGreaterThan(0);
      expect(lvl.range).toBeGreaterThan(0);
    }
    expect(towers.cannon.levels[0].splashRadius).toBe(2.5);
    expect(towers.spike.levels[0].tickInterval).toBe(0.5);
    expect(towers.frozen.levels.map((l) => l.freezeRadius)).toEqual([1, 2, 3]);
    expect(towers.spike.hitsFlying).toBe(false);
    expect(towers.crossbow.hitsFlying).toBe(true);
  });
});

describe('enemy definitions', () => {
  it('has the four trolls', () => {
    expect(Object.keys(enemies).sort()).toEqual(['bat', 'boss', 'brute', 'scout']);
    expect(enemies.bat.flying).toBe(true);
    expect(enemies.boss.livesCost).toBe(5);
    for (const def of Object.values(enemies)) {
      expect(def.hp).toBeGreaterThan(0);
      expect(def.speed).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/data/defs.test.js`
Expected: FAIL, cannot resolve `./towers.json`.

- [ ] **Step 3: Write the data files**

`client/src/data/towers.json`:
```json
{
  "crossbow": {
    "name": "Crossbow Tower",
    "kind": "projectile",
    "hitsFlying": true,
    "hitsGround": true,
    "projectile": "arrow",
    "levels": [
      { "cost": 50, "fireRate": 3.0, "damage": 6, "range": 7 },
      { "cost": 40, "fireRate": 3.5, "damage": 8, "range": 8 },
      { "cost": 60, "fireRate": 4.0, "damage": 11, "range": 9 }
    ]
  },
  "spike": {
    "name": "Spike Tower",
    "kind": "area",
    "hitsFlying": false,
    "hitsGround": true,
    "levels": [
      { "cost": 80, "tickInterval": 0.5, "damage": 4, "range": 3.5 },
      { "cost": 60, "tickInterval": 0.5, "damage": 6, "range": 4 },
      { "cost": 90, "tickInterval": 0.5, "damage": 9, "range": 4.5 }
    ]
  },
  "cannon": {
    "name": "Cannon Tower",
    "kind": "projectile",
    "hitsFlying": true,
    "hitsGround": true,
    "projectile": "shell",
    "levels": [
      { "cost": 150, "fireRate": 0.5, "damage": 40, "range": 10, "splashRadius": 2.5, "splashFactor": 0.5 },
      { "cost": 120, "fireRate": 0.6, "damage": 60, "range": 11, "splashRadius": 2.5, "splashFactor": 0.5 },
      { "cost": 180, "fireRate": 0.7, "damage": 90, "range": 12, "splashRadius": 2.5, "splashFactor": 0.5 }
    ]
  },
  "frozen": {
    "name": "Frozen Ice Block",
    "kind": "freeze",
    "hitsFlying": false,
    "hitsGround": true,
    "levels": [
      { "cost": 100, "freezeRadius": 1, "slow": 0.5 },
      { "cost": 80, "freezeRadius": 2, "slow": 0.5 },
      { "cost": 120, "freezeRadius": 3, "slow": 0.5 }
    ]
  }
}
```

`client/src/data/enemies.json`:
```json
{
  "scout": { "name": "Scout Troll", "hp": 30, "speed": 3.0, "gold": 5, "score": 10, "flying": false, "livesCost": 1 },
  "brute": { "name": "Brute Troll", "hp": 160, "speed": 1.4, "gold": 15, "score": 30, "flying": false, "livesCost": 2 },
  "bat":   { "name": "Bat Troll", "hp": 60, "speed": 2.2, "gold": 10, "score": 20, "flying": true, "livesCost": 1 },
  "boss":  { "name": "Boss Troll", "hp": 1200, "speed": 1.0, "gold": 100, "score": 300, "flying": false, "livesCost": 5 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/data/defs.test.js`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/data && git commit -m "feat(data): add tower and enemy definitions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Map validator and the Green Meadows map

**Files:**
- Create: `client/src/game/validateMap.js`, `client/src/data/maps/green.json`, `client/src/game/testMap.js`
- Test: `client/src/game/validateMap.test.js`

**Interfaces:**
- Produces: `validateMap(map, enemyDefs) → true` or throws `Error("Map \"<id>\": <reason>")`.
- Produces: `makeTestMap(overrides) → map` (6×3 straight road, 20 waves of one scout, 500 gold).
- Map JSON shape: `{ id, name, theme, width, height, tiles: string[], paths: [[x,y],...][], base: [x,y], waves: [{spawns:[{type,count,interval,delay?,path?}]}], startGold, modifiers?: {frostBonus} }`.

- [ ] **Step 1: Write the test map helper**

`client/src/game/testMap.js`:
```js
/** A tiny valid map for unit tests: straight road along row 1 from x=0 to x=5. */
export function makeTestMap(overrides = {}) {
  return {
    id: 'test',
    name: 'Test Map',
    theme: 'green',
    width: 6,
    height: 3,
    tiles: ['......', 'RRRRRR', '......'],
    paths: [[[0, 1], [5, 1]]],
    base: [5, 1],
    waves: Array.from({ length: 20 }, () => ({
      spawns: [{ type: 'scout', count: 1, interval: 1 }],
    })),
    startGold: 500,
    modifiers: { frostBonus: 1 },
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`client/src/game/validateMap.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateMap } from './validateMap.js';
import { makeTestMap } from './testMap.js';
import enemies from '../data/enemies.json';
import green from '../data/maps/green.json';

describe('validateMap', () => {
  it('accepts the test map and the green map', () => {
    expect(validateMap(makeTestMap(), enemies)).toBe(true);
    expect(validateMap(green, enemies)).toBe(true);
  });

  it('rejects a path that leaves the road', () => {
    const map = makeTestMap({ tiles: ['......', 'RRR.RR', '......'] });
    expect(() => validateMap(map, enemies)).toThrow(/non-road tile at 3,1/);
  });

  it('rejects a path that does not end at the base', () => {
    const map = makeTestMap({ paths: [[[0, 1], [4, 1]]] });
    expect(() => validateMap(map, enemies)).toThrow(/must end at base/);
  });

  it('rejects a path that does not start on a map edge', () => {
    const map = makeTestMap({ paths: [[[1, 1], [5, 1]]] });
    expect(() => validateMap(map, enemies)).toThrow(/map edge/);
  });

  it('rejects diagonal segments', () => {
    const map = makeTestMap({ tiles: ['R.....', 'RRRRRR', '......'], paths: [[[0, 0], [5, 1]]] });
    expect(() => validateMap(map, enemies)).toThrow(/axis-aligned/);
  });

  it('rejects a base that is not on a road tile', () => {
    const map = makeTestMap({ base: [5, 0], paths: [[[0, 1], [5, 1], [5, 0]]] });
    expect(() => validateMap(map, enemies)).toThrow(/base must be on a road tile/);
  });

  it('requires exactly 20 waves', () => {
    const map = makeTestMap({ waves: makeTestMap().waves.slice(0, 19) });
    expect(() => validateMap(map, enemies)).toThrow(/exactly 20 waves/);
  });

  it('rejects unknown enemy types and bad counts', () => {
    const waves = makeTestMap().waves;
    waves[3] = { spawns: [{ type: 'dragon', count: 1, interval: 1 }] };
    expect(() => validateMap(makeTestMap({ waves }), enemies)).toThrow(/unknown enemy 'dragon'/);
    const waves2 = makeTestMap().waves;
    waves2[0] = { spawns: [{ type: 'scout', count: 0, interval: 1 }] };
    expect(() => validateMap(makeTestMap({ waves: waves2 }), enemies)).toThrow(/invalid count/);
  });

  it('rejects wrong row lengths and bad tile characters', () => {
    expect(() => validateMap(makeTestMap({ tiles: ['.....', 'RRRRRR', '......'] }), enemies)).toThrow(/row 0/);
    expect(() => validateMap(makeTestMap({ tiles: ['...X..', 'RRRRRR', '......'] }), enemies)).toThrow(/invalid tile 'X'/);
  });

  it('rejects spawns that reference a missing path', () => {
    const waves = makeTestMap().waves;
    waves[0] = { spawns: [{ type: 'scout', count: 1, interval: 1, path: 1 }] };
    expect(() => validateMap(makeTestMap({ waves }), enemies)).toThrow(/unknown path 1/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/validateMap.test.js`
Expected: FAIL, cannot find `./validateMap.js`.

- [ ] **Step 4: Implement the validator**

`client/src/game/validateMap.js`:
```js
const TILE_CHARS = '.RWD';
const REQUIRED = ['id', 'name', 'theme', 'width', 'height', 'tiles', 'paths', 'base', 'waves', 'startGold'];

/**
 * Validates a map definition. Throws a descriptive Error on the first problem.
 * @param {object} map
 * @param {Record<string, object>} enemyDefs
 * @returns {true}
 */
export function validateMap(map, enemyDefs) {
  const fail = (msg) => {
    throw new Error(`Map "${map?.id ?? '?'}": ${msg}`);
  };
  if (!map || typeof map !== 'object') fail('not an object');
  for (const k of REQUIRED) if (!(k in map)) fail(`missing field ${k}`);

  if (!Array.isArray(map.tiles) || map.tiles.length !== map.height) fail(`tiles must have ${map.height} rows`);
  map.tiles.forEach((row, y) => {
    if (typeof row !== 'string' || row.length !== map.width) fail(`row ${y} must have ${map.width} chars`);
    for (const c of row) if (!TILE_CHARS.includes(c)) fail(`row ${y} has invalid tile '${c}'`);
  });

  const tile = (x, y) => map.tiles[y]?.[x];
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;

  const [bx, by] = map.base;
  if (!inBounds(bx, by) || tile(bx, by) !== 'R') fail('base must be on a road tile');

  if (!Array.isArray(map.paths) || map.paths.length === 0) fail('at least one path required');
  map.paths.forEach((path, i) => {
    if (!Array.isArray(path) || path.length < 2) fail(`path ${i} needs at least 2 waypoints`);
    const [sx, sy] = path[0];
    const onEdge = sx === 0 || sy === 0 || sx === map.width - 1 || sy === map.height - 1;
    if (!onEdge) fail(`path ${i} must start on a map edge`);
    const [ex, ey] = path[path.length - 1];
    if (ex !== bx || ey !== by) fail(`path ${i} must end at base`);
    for (let w = 0; w < path.length - 1; w++) {
      const [x0, y0] = path[w];
      const [x1, y1] = path[w + 1];
      if (x0 !== x1 && y0 !== y1) fail(`path ${i} segment ${w} is not axis-aligned`);
      const dx = Math.sign(x1 - x0);
      const dy = Math.sign(y1 - y0);
      let x = x0;
      let y = y0;
      for (;;) {
        if (!inBounds(x, y)) fail(`path ${i} leaves the map at ${x},${y}`);
        if (tile(x, y) !== 'R') fail(`path ${i} crosses non-road tile at ${x},${y}`);
        if (x === x1 && y === y1) break;
        x += dx;
        y += dy;
      }
    }
  });

  if (!Array.isArray(map.waves) || map.waves.length !== 20) fail('exactly 20 waves required');
  map.waves.forEach((wave, i) => {
    if (!Array.isArray(wave.spawns) || wave.spawns.length === 0) fail(`wave ${i + 1} has no spawns`);
    for (const s of wave.spawns) {
      if (!enemyDefs[s.type]) fail(`wave ${i + 1} uses unknown enemy '${s.type}'`);
      if (!Number.isInteger(s.count) || s.count < 1) fail(`wave ${i + 1} has invalid count`);
      if (!(s.interval > 0)) fail(`wave ${i + 1} has invalid interval`);
      const p = s.path ?? 0;
      if (!map.paths[p]) fail(`wave ${i + 1} uses unknown path ${p}`);
    }
  });

  if (!(map.startGold >= 0)) fail('startGold must be a non-negative number');
  return true;
}
```

- [ ] **Step 5: Write the Green Meadows map**

`client/src/data/maps/green.json`:
```json
{
  "id": "green",
  "name": "Green Meadows",
  "theme": "green",
  "description": "Rolling hills and a long lazy road. A good place to start.",
  "width": 16,
  "height": 12,
  "tiles": [
    "................",
    "..D.............",
    "............RRRR",
    "............R...",
    "............R..D",
    "RRRRRR......R...",
    ".....R......R...",
    ".....R..D...R...",
    ".....R......R...",
    ".....RRRRRRRR...",
    "................",
    "...D..........D."
  ],
  "paths": [[[0, 5], [5, 5], [5, 9], [12, 9], [12, 2], [15, 2]]],
  "base": [15, 2],
  "startGold": 200,
  "modifiers": { "frostBonus": 1.0 },
  "waves": [
    { "spawns": [{ "type": "scout", "count": 6, "interval": 1.0 }] },
    { "spawns": [{ "type": "scout", "count": 10, "interval": 0.8 }] },
    { "spawns": [{ "type": "scout", "count": 8, "interval": 0.8 }, { "type": "brute", "count": 2, "interval": 2.0, "delay": 4 }] },
    { "spawns": [{ "type": "scout", "count": 12, "interval": 0.7 }] },
    { "spawns": [{ "type": "brute", "count": 5, "interval": 1.5 }] },
    { "spawns": [{ "type": "scout", "count": 10, "interval": 0.7 }, { "type": "bat", "count": 4, "interval": 1.0, "delay": 3 }] },
    { "spawns": [{ "type": "bat", "count": 8, "interval": 0.9 }] },
    { "spawns": [{ "type": "brute", "count": 6, "interval": 1.4 }, { "type": "scout", "count": 10, "interval": 0.6, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 20, "interval": 0.5 }] },
    { "spawns": [{ "type": "boss", "count": 1, "interval": 1.0 }, { "type": "scout", "count": 8, "interval": 0.8, "delay": 2 }] },
    { "spawns": [{ "type": "bat", "count": 10, "interval": 0.8 }, { "type": "brute", "count": 6, "interval": 1.4, "delay": 3 }] },
    { "spawns": [{ "type": "scout", "count": 20, "interval": 0.5 }, { "type": "bat", "count": 6, "interval": 0.9, "delay": 5 }] },
    { "spawns": [{ "type": "brute", "count": 10, "interval": 1.2 }] },
    { "spawns": [{ "type": "bat", "count": 14, "interval": 0.7 }] },
    { "spawns": [{ "type": "scout", "count": 25, "interval": 0.4 }, { "type": "brute", "count": 5, "interval": 1.5, "delay": 6 }] },
    { "spawns": [{ "type": "brute", "count": 8, "interval": 1.2 }, { "type": "bat", "count": 8, "interval": 0.8, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 30, "interval": 0.4 }] },
    { "spawns": [{ "type": "bat", "count": 12, "interval": 0.7 }, { "type": "brute", "count": 10, "interval": 1.1, "delay": 1 }] },
    { "spawns": [{ "type": "scout", "count": 20, "interval": 0.5 }, { "type": "bat", "count": 10, "interval": 0.8, "delay": 4 }, { "type": "brute", "count": 8, "interval": 1.2, "delay": 8 }] },
    { "spawns": [{ "type": "boss", "count": 2, "interval": 6.0 }, { "type": "scout", "count": 15, "interval": 0.5, "delay": 3 }, { "type": "bat", "count": 8, "interval": 0.8, "delay": 8 }] }
  ]
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/validateMap.test.js`
Expected: 10 passed.

- [ ] **Step 7: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/validateMap.js client/src/game/validateMap.test.js client/src/game/testMap.js client/src/data/maps/green.json && git commit -m "feat(game): add map validator and Green Meadows map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The three remaining maps and the data index

**Files:**
- Create: `client/src/data/maps/snow.json`, `client/src/data/maps/desert.json`, `client/src/data/maps/water.json`, `client/src/data/index.js`
- Test: `client/src/data/maps.test.js`

**Interfaces:**
- Produces: `import { TOWER_DEFS, ENEMY_DEFS, MAPS, MAP_ORDER } from '../data/index.js'` where `MAPS` is `{green, snow, desert, water}` and `MAP_ORDER = ['green','snow','desert','water']`.

- [ ] **Step 1: Write the failing test**

`client/src/data/maps.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateMap } from '../game/validateMap.js';
import { MAPS, MAP_ORDER, ENEMY_DEFS, TOWER_DEFS } from './index.js';

describe('shipped maps', () => {
  it('lists four maps in order', () => {
    expect(MAP_ORDER).toEqual(['green', 'snow', 'desert', 'water']);
    expect(Object.keys(TOWER_DEFS)).toHaveLength(4);
    expect(Object.keys(ENEMY_DEFS)).toHaveLength(4);
  });

  for (const id of ['green', 'snow', 'desert', 'water']) {
    it(`${id} validates and matches its id/theme`, () => {
      const map = MAPS[id];
      expect(map.id).toBe(id);
      expect(map.theme).toBe(id);
      expect(validateMap(map, ENEMY_DEFS)).toBe(true);
    });
  }

  it('has bosses on waves 10 and 20 of every map', () => {
    for (const map of Object.values(MAPS)) {
      for (const w of [9, 19]) {
        expect(map.waves[w].spawns.some((s) => s.type === 'boss')).toBe(true);
      }
    }
  });

  it('gives the water map two paths and the snow map a frost bonus', () => {
    expect(MAPS.water.paths).toHaveLength(2);
    expect(MAPS.water.waves.some((w) => w.spawns.some((s) => s.path === 1))).toBe(true);
    expect(MAPS.snow.modifiers.frostBonus).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/data/maps.test.js`
Expected: FAIL, cannot resolve `./index.js`.

- [ ] **Step 3: Write snow.json (Frosty Peaks)**

`client/src/data/maps/snow.json`:
```json
{
  "id": "snow",
  "name": "Frosty Peaks",
  "theme": "snow",
  "description": "A long winding mountain road. Frozen towers bite harder up here.",
  "width": 16,
  "height": 12,
  "tiles": [
    "................",
    "RRRR.......D....",
    "...R....RRRRRR..",
    "...R....R....R..",
    "...R.D..R....R..",
    "...R....R....R..",
    "...RRRRRR....R..",
    ".............R..",
    "......D......RD.",
    ".............R..",
    "..RRRRRRRRRRRR..",
    "..D............."
  ],
  "paths": [[[0, 1], [3, 1], [3, 6], [8, 6], [8, 2], [13, 2], [13, 10], [2, 10]]],
  "base": [2, 10],
  "startGold": 220,
  "modifiers": { "frostBonus": 1.25 },
  "waves": [
    { "spawns": [{ "type": "scout", "count": 8, "interval": 0.9 }] },
    { "spawns": [{ "type": "scout", "count": 12, "interval": 0.7 }] },
    { "spawns": [{ "type": "brute", "count": 3, "interval": 2.0 }, { "type": "scout", "count": 6, "interval": 0.8, "delay": 3 }] },
    { "spawns": [{ "type": "bat", "count": 6, "interval": 1.0 }] },
    { "spawns": [{ "type": "scout", "count": 16, "interval": 0.6 }] },
    { "spawns": [{ "type": "brute", "count": 6, "interval": 1.5 }] },
    { "spawns": [{ "type": "bat", "count": 8, "interval": 0.9 }, { "type": "scout", "count": 10, "interval": 0.6, "delay": 4 }] },
    { "spawns": [{ "type": "scout", "count": 20, "interval": 0.5 }] },
    { "spawns": [{ "type": "brute", "count": 8, "interval": 1.3 }, { "type": "bat", "count": 6, "interval": 1.0, "delay": 2 }] },
    { "spawns": [{ "type": "boss", "count": 1, "interval": 1.0 }, { "type": "scout", "count": 10, "interval": 0.7, "delay": 3 }] },
    { "spawns": [{ "type": "scout", "count": 24, "interval": 0.45 }] },
    { "spawns": [{ "type": "bat", "count": 12, "interval": 0.8 }] },
    { "spawns": [{ "type": "brute", "count": 10, "interval": 1.2 }, { "type": "scout", "count": 10, "interval": 0.5, "delay": 5 }] },
    { "spawns": [{ "type": "bat", "count": 10, "interval": 0.8 }, { "type": "brute", "count": 6, "interval": 1.4, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 30, "interval": 0.4 }] },
    { "spawns": [{ "type": "brute", "count": 12, "interval": 1.1 }] },
    { "spawns": [{ "type": "bat", "count": 16, "interval": 0.7 }, { "type": "scout", "count": 12, "interval": 0.5, "delay": 6 }] },
    { "spawns": [{ "type": "scout", "count": 25, "interval": 0.4 }, { "type": "brute", "count": 8, "interval": 1.2, "delay": 4 }] },
    { "spawns": [{ "type": "brute", "count": 12, "interval": 1.0 }, { "type": "bat", "count": 12, "interval": 0.8, "delay": 3 }] },
    { "spawns": [{ "type": "boss", "count": 2, "interval": 6.0 }, { "type": "bat", "count": 10, "interval": 0.8, "delay": 3 }, { "type": "scout", "count": 20, "interval": 0.5, "delay": 6 }] }
  ]
}
```

- [ ] **Step 4: Write desert.json (Dusty Dunes)**

`client/src/data/maps/desert.json`:
```json
{
  "id": "desert",
  "name": "Dusty Dunes",
  "theme": "desert",
  "description": "A short, fast road through the sand. The trolls arrive quickly.",
  "width": 16,
  "height": 12,
  "tiles": [
    "..D.........D...",
    "................",
    "................",
    "........D.......",
    "......RRRRRRRRRR",
    "......R.........",
    "RRRRRRR.........",
    "................",
    "...D.......D....",
    "................",
    ".......D........",
    "................"
  ],
  "paths": [[[0, 6], [6, 6], [6, 4], [15, 4]]],
  "base": [15, 4],
  "startGold": 260,
  "modifiers": { "frostBonus": 1.0 },
  "waves": [
    { "spawns": [{ "type": "scout", "count": 6, "interval": 1.2 }] },
    { "spawns": [{ "type": "scout", "count": 8, "interval": 1.0 }] },
    { "spawns": [{ "type": "brute", "count": 2, "interval": 2.5 }, { "type": "scout", "count": 6, "interval": 1.0, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 10, "interval": 0.9 }] },
    { "spawns": [{ "type": "bat", "count": 5, "interval": 1.2 }] },
    { "spawns": [{ "type": "brute", "count": 5, "interval": 1.8 }] },
    { "spawns": [{ "type": "scout", "count": 14, "interval": 0.7 }] },
    { "spawns": [{ "type": "bat", "count": 8, "interval": 1.0 }, { "type": "scout", "count": 6, "interval": 0.8, "delay": 4 }] },
    { "spawns": [{ "type": "brute", "count": 7, "interval": 1.5 }] },
    { "spawns": [{ "type": "boss", "count": 1, "interval": 1.0 }, { "type": "scout", "count": 6, "interval": 1.0, "delay": 4 }] },
    { "spawns": [{ "type": "scout", "count": 18, "interval": 0.6 }] },
    { "spawns": [{ "type": "bat", "count": 10, "interval": 0.9 }] },
    { "spawns": [{ "type": "brute", "count": 8, "interval": 1.4 }, { "type": "scout", "count": 8, "interval": 0.7, "delay": 3 }] },
    { "spawns": [{ "type": "scout", "count": 22, "interval": 0.5 }] },
    { "spawns": [{ "type": "bat", "count": 12, "interval": 0.8 }, { "type": "brute", "count": 5, "interval": 1.5, "delay": 2 }] },
    { "spawns": [{ "type": "brute", "count": 10, "interval": 1.2 }] },
    { "spawns": [{ "type": "scout", "count": 26, "interval": 0.45 }] },
    { "spawns": [{ "type": "bat", "count": 14, "interval": 0.7 }, { "type": "scout", "count": 10, "interval": 0.6, "delay": 5 }] },
    { "spawns": [{ "type": "brute", "count": 12, "interval": 1.1 }, { "type": "bat", "count": 8, "interval": 0.9, "delay": 4 }] },
    { "spawns": [{ "type": "boss", "count": 2, "interval": 7.0 }, { "type": "scout", "count": 16, "interval": 0.5, "delay": 3 }, { "type": "brute", "count": 6, "interval": 1.3, "delay": 8 }] }
  ]
}
```

- [ ] **Step 5: Write water.json (Soggy Swamp)**

`client/src/data/maps/water.json`:
```json
{
  "id": "water",
  "name": "Soggy Swamp",
  "theme": "water",
  "description": "Two roads, little dry land. Every build spot counts.",
  "width": 16,
  "height": 12,
  "tiles": [
    "WW......WWW.....",
    "W......D..W.....",
    "RRRRR.....W..WW.",
    "....R.W.......W.",
    "....R.WW........",
    "....R......D....",
    "....RRRRRRRRRRRR",
    "WW.......R....W.",
    "W..D.....R...WW.",
    ".........R......",
    "RRRRRRRRRR.....W",
    "WWW.....W....WWW"
  ],
  "paths": [
    [[0, 2], [4, 2], [4, 6], [15, 6]],
    [[0, 10], [9, 10], [9, 6], [15, 6]]
  ],
  "base": [15, 6],
  "startGold": 240,
  "modifiers": { "frostBonus": 1.0 },
  "waves": [
    { "spawns": [{ "type": "scout", "count": 6, "interval": 1.0, "path": 0 }] },
    { "spawns": [{ "type": "scout", "count": 6, "interval": 1.0, "path": 1 }] },
    { "spawns": [{ "type": "scout", "count": 6, "interval": 1.0, "path": 0 }, { "type": "scout", "count": 6, "interval": 1.0, "path": 1 }] },
    { "spawns": [{ "type": "brute", "count": 3, "interval": 2.0, "path": 0 }, { "type": "scout", "count": 6, "interval": 0.8, "path": 1, "delay": 2 }] },
    { "spawns": [{ "type": "bat", "count": 6, "interval": 1.0, "path": 1 }] },
    { "spawns": [{ "type": "scout", "count": 10, "interval": 0.7, "path": 0 }, { "type": "brute", "count": 3, "interval": 2.0, "path": 1, "delay": 1 }] },
    { "spawns": [{ "type": "bat", "count": 6, "interval": 1.0, "path": 0 }, { "type": "bat", "count": 6, "interval": 1.0, "path": 1, "delay": 2 }] },
    { "spawns": [{ "type": "brute", "count": 6, "interval": 1.5, "path": 1 }, { "type": "scout", "count": 10, "interval": 0.6, "path": 0, "delay": 3 }] },
    { "spawns": [{ "type": "scout", "count": 12, "interval": 0.5, "path": 0 }, { "type": "scout", "count": 12, "interval": 0.5, "path": 1 }] },
    { "spawns": [{ "type": "boss", "count": 1, "interval": 1.0, "path": 0 }, { "type": "scout", "count": 8, "interval": 0.8, "path": 1, "delay": 3 }] },
    { "spawns": [{ "type": "bat", "count": 10, "interval": 0.8, "path": 0 }, { "type": "brute", "count": 5, "interval": 1.5, "path": 1, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 20, "interval": 0.5, "path": 1 }, { "type": "bat", "count": 6, "interval": 0.9, "path": 0, "delay": 4 }] },
    { "spawns": [{ "type": "brute", "count": 6, "interval": 1.3, "path": 0 }, { "type": "brute", "count": 6, "interval": 1.3, "path": 1, "delay": 1 }] },
    { "spawns": [{ "type": "bat", "count": 14, "interval": 0.7, "path": 1 }] },
    { "spawns": [{ "type": "scout", "count": 15, "interval": 0.45, "path": 0 }, { "type": "scout", "count": 15, "interval": 0.45, "path": 1, "delay": 1 }, { "type": "brute", "count": 4, "interval": 1.5, "path": 0, "delay": 8 }] },
    { "spawns": [{ "type": "brute", "count": 8, "interval": 1.2, "path": 1 }, { "type": "bat", "count": 8, "interval": 0.8, "path": 0, "delay": 2 }] },
    { "spawns": [{ "type": "scout", "count": 30, "interval": 0.4, "path": 0 }] },
    { "spawns": [{ "type": "bat", "count": 12, "interval": 0.7, "path": 0 }, { "type": "brute", "count": 10, "interval": 1.1, "path": 1, "delay": 1 }] },
    { "spawns": [{ "type": "scout", "count": 12, "interval": 0.5, "path": 0 }, { "type": "scout", "count": 12, "interval": 0.5, "path": 1 }, { "type": "bat", "count": 10, "interval": 0.8, "path": 1, "delay": 5 }, { "type": "brute", "count": 8, "interval": 1.2, "path": 0, "delay": 8 }] },
    { "spawns": [{ "type": "boss", "count": 1, "interval": 1.0, "path": 0 }, { "type": "boss", "count": 1, "interval": 1.0, "path": 1, "delay": 6 }, { "type": "scout", "count": 16, "interval": 0.5, "path": 1, "delay": 3 }, { "type": "bat", "count": 8, "interval": 0.8, "path": 0, "delay": 8 }] }
  ]
}
```

- [ ] **Step 6: Write the data index**

`client/src/data/index.js`:
```js
import towers from './towers.json';
import enemies from './enemies.json';
import green from './maps/green.json';
import snow from './maps/snow.json';
import desert from './maps/desert.json';
import water from './maps/water.json';

export const TOWER_DEFS = towers;
export const ENEMY_DEFS = enemies;
export const MAPS = { green, snow, desert, water };
export const MAP_ORDER = ['green', 'snow', 'desert', 'water'];
export const TOWER_ORDER = ['crossbow', 'spike', 'cannon', 'frozen'];
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/data`
Expected: all passed (maps.test.js 7 tests, defs.test.js 3 tests).

- [ ] **Step 8: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/data && git commit -m "feat(data): add snow, desert and water maps plus data index

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Grid

**Files:**
- Create: `client/src/game/Grid.js`
- Test: `client/src/game/Grid.test.js`

**Interfaces:**
- Produces: `TILE_SIZE = 2`; `class Grid(map)` with `inBounds(x,y)`, `tileAt(x,y)`, `isRoad(x,y)`, `isBuildable(x,y)` (buildable char and unoccupied), `occupy(x,y,towerId)`, `release(x,y)`, `towerIdAt(x,y)`, `tileToWorld(x,y) → {x,z}`, `worldToTile(wx,wz) → {x,y}`, `pathToWorld(i) → [{x,z}]`, `roadTilesWithin(cx,cy,radius) → [[x,y]]` (Chebyshev distance), `speedMultiplierAt(x,y)`, `recomputeFrozen(sources) → changed[]` where a source is `{x,y,radius,slow}`, `frozenTiles() → [{x,y,multiplier}]`, `frostBonus`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Grid.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { Grid, TILE_SIZE } from './Grid.js';
import { makeTestMap } from './testMap.js';

describe('Grid', () => {
  it('converts between tile and world coordinates', () => {
    const g = new Grid(makeTestMap());
    expect(TILE_SIZE).toBe(2);
    expect(g.tileToWorld(0, 0)).toEqual({ x: 1, z: 1 });
    expect(g.tileToWorld(3, 1)).toEqual({ x: 7, z: 3 });
    expect(g.worldToTile(7.9, 2.1)).toEqual({ x: 3, y: 1 });
    expect(g.worldToTile(-0.5, 0)).toEqual({ x: -1, y: 0 });
  });

  it('reports tile types and bounds', () => {
    const g = new Grid(makeTestMap());
    expect(g.tileAt(0, 1)).toBe('R');
    expect(g.tileAt(0, 0)).toBe('.');
    expect(g.tileAt(6, 0)).toBeNull();
    expect(g.isRoad(2, 1)).toBe(true);
    expect(g.isBuildable(2, 0)).toBe(true);
    expect(g.isBuildable(2, 1)).toBe(false);
  });

  it('tracks occupancy', () => {
    const g = new Grid(makeTestMap());
    g.occupy(2, 0, 7);
    expect(g.isBuildable(2, 0)).toBe(false);
    expect(g.towerIdAt(2, 0)).toBe(7);
    g.release(2, 0);
    expect(g.isBuildable(2, 0)).toBe(true);
    expect(g.towerIdAt(2, 0)).toBeNull();
  });

  it('converts a path to world waypoints', () => {
    const g = new Grid(makeTestMap());
    expect(g.pathToWorld(0)).toEqual([{ x: 1, z: 3 }, { x: 11, z: 3 }]);
  });

  it('finds road tiles within a Chebyshev radius', () => {
    const g = new Grid(makeTestMap());
    expect(g.roadTilesWithin(2, 0, 1).sort()).toEqual([[1, 1], [2, 1], [3, 1]].sort());
    expect(g.roadTilesWithin(2, 0, 2)).toHaveLength(5);
  });

  it('recomputes frozen tiles from sources and reports changes', () => {
    const g = new Grid(makeTestMap());
    const changed = g.recomputeFrozen([{ x: 2, y: 0, radius: 1, slow: 0.5 }]);
    expect(changed).toHaveLength(3);
    expect(g.speedMultiplierAt(2, 1)).toBe(0.5);
    expect(g.speedMultiplierAt(4, 1)).toBe(1);
    expect(g.frozenTiles()).toHaveLength(3);
    const changed2 = g.recomputeFrozen([]);
    expect(changed2).toHaveLength(3);
    expect(g.frozenTiles()).toHaveLength(0);
  });

  it('applies the map frost bonus and keeps the strongest slow', () => {
    const g = new Grid(makeTestMap({ modifiers: { frostBonus: 1.25 } }));
    g.recomputeFrozen([
      { x: 2, y: 0, radius: 1, slow: 0.5 },
      { x: 2, y: 2, radius: 1, slow: 0.8 },
    ]);
    expect(g.speedMultiplierAt(2, 1)).toBeCloseTo(0.375);
  });

  it('never slows below 0.1', () => {
    const g = new Grid(makeTestMap({ modifiers: { frostBonus: 3 } }));
    g.recomputeFrozen([{ x: 2, y: 0, radius: 1, slow: 0.5 }]);
    expect(g.speedMultiplierAt(2, 1)).toBe(0.1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Grid.test.js`
Expected: FAIL, cannot find `./Grid.js`.

- [ ] **Step 3: Implement Grid**

`client/src/game/Grid.js`:
```js
export const TILE_SIZE = 2;

export const TILE = { BUILDABLE: '.', ROAD: 'R', WATER: 'W', DECOR: 'D' };

/** Tile map, tower occupancy, frozen-tile state and coordinate conversion. */
export class Grid {
  constructor(map) {
    this.map = map;
    this.width = map.width;
    this.height = map.height;
    this.tiles = map.tiles;
    this.frostBonus = map.modifiers?.frostBonus ?? 1;
    this.occupied = new Map(); // "x,y" -> towerId
    this.frozen = new Map(); // "x,y" -> speed multiplier (< 1)
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : null;
  }

  isRoad(x, y) {
    return this.tileAt(x, y) === TILE.ROAD;
  }

  isBuildable(x, y) {
    return this.tileAt(x, y) === TILE.BUILDABLE && !this.occupied.has(Grid.key(x, y));
  }

  occupy(x, y, towerId) {
    this.occupied.set(Grid.key(x, y), towerId);
  }

  release(x, y) {
    this.occupied.delete(Grid.key(x, y));
  }

  towerIdAt(x, y) {
    return this.occupied.get(Grid.key(x, y)) ?? null;
  }

  tileToWorld(x, y) {
    return { x: (x + 0.5) * TILE_SIZE, z: (y + 0.5) * TILE_SIZE };
  }

  worldToTile(wx, wz) {
    return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wz / TILE_SIZE) };
  }

  pathToWorld(pathIndex) {
    return this.map.paths[pathIndex].map(([x, y]) => this.tileToWorld(x, y));
  }

  /** Road tiles whose Chebyshev distance to (cx,cy) is <= radius. */
  roadTilesWithin(cx, cy, radius) {
    const out = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (this.isRoad(x, y)) out.push([x, y]);
      }
    }
    return out;
  }

  speedMultiplierAt(x, y) {
    return this.frozen.get(Grid.key(x, y)) ?? 1;
  }

  /**
   * Rebuilds the frozen map from freeze sources [{x,y,radius,slow}].
   * Returns the tiles whose multiplier changed: [{x,y,multiplier}].
   */
  recomputeFrozen(sources) {
    const next = new Map();
    for (const s of sources) {
      const mult = Math.max(0.1, 1 - (1 - s.slow) * this.frostBonus);
      for (const [x, y] of this.roadTilesWithin(s.x, s.y, s.radius)) {
        const k = Grid.key(x, y);
        next.set(k, Math.min(next.get(k) ?? 1, mult));
      }
    }
    const changed = [];
    const keys = new Set([...this.frozen.keys(), ...next.keys()]);
    for (const k of keys) {
      const before = this.frozen.get(k) ?? 1;
      const after = next.get(k) ?? 1;
      if (before !== after) {
        const [x, y] = k.split(',').map(Number);
        changed.push({ x, y, multiplier: after });
      }
    }
    this.frozen = next;
    return changed;
  }

  frozenTiles() {
    return [...this.frozen.entries()].map(([k, multiplier]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y, multiplier };
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Grid.test.js`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Grid.js client/src/game/Grid.test.js && git commit -m "feat(game): add Grid with occupancy and frozen tiles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Enemy

**Files:**
- Create: `client/src/game/Enemy.js`
- Test: `client/src/game/Enemy.test.js`

**Interfaces:**
- Consumes: `Grid.worldToTile`, `Grid.speedMultiplierAt`.
- Produces: `class Enemy({ type, def, path, hpMultiplier=1, wave=0, pathIndex=0 })` with fields `id, type, wave, pathIndex, hp, maxHp, baseSpeed, flying, gold, score, livesCost, x, z, heading, alive, reachedBase, speedMultiplier`, getter `distanceToBase`, methods `update(dt, grid)`, `takeDamage(amount) → died:boolean`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Enemy.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { Enemy } from './Enemy.js';
import { Grid } from './Grid.js';
import { makeTestMap } from './testMap.js';
import enemies from '../data/enemies.json';

function make(type = 'scout', extra = {}) {
  const grid = new Grid(makeTestMap());
  const enemy = new Enemy({ type, def: enemies[type], path: grid.pathToWorld(0), ...extra });
  return { grid, enemy };
}

describe('Enemy', () => {
  it('starts at the first waypoint with scaled hp', () => {
    const { enemy } = make('scout', { hpMultiplier: 1.5, wave: 4 });
    expect(enemy.x).toBe(1);
    expect(enemy.z).toBe(3);
    expect(enemy.maxHp).toBe(45);
    expect(enemy.hp).toBe(45);
    expect(enemy.wave).toBe(4);
    expect(enemy.distanceToBase).toBe(10);
  });

  it('moves along the path at its speed', () => {
    const { grid, enemy } = make('scout');
    enemy.update(1, grid);
    expect(enemy.x).toBeCloseTo(4);
    expect(enemy.z).toBeCloseTo(3);
    expect(enemy.distanceToBase).toBeCloseTo(7);
    expect(enemy.heading).toBeCloseTo(Math.PI / 2);
  });

  it('turns corners without losing distance', () => {
    const grid = new Grid(makeTestMap());
    const enemy = new Enemy({ type: 'scout', def: enemies.scout, path: [{ x: 1, z: 1 }, { x: 3, z: 1 }, { x: 3, z: 5 }] });
    enemy.update(1, grid); // moves 3 units: 2 east then 1 south
    expect(enemy.x).toBeCloseTo(3);
    expect(enemy.z).toBeCloseTo(2);
  });

  it('reaches the base and stops', () => {
    const { grid, enemy } = make('scout');
    enemy.update(10, grid);
    expect(enemy.reachedBase).toBe(true);
    expect(enemy.x).toBe(11);
    enemy.update(1, grid);
    expect(enemy.x).toBe(11);
  });

  it('is slowed on frozen tiles unless flying', () => {
    const { grid, enemy } = make('scout');
    grid.recomputeFrozen([{ x: 0, y: 0, radius: 1, slow: 0.5 }]);
    enemy.update(0.5, grid);
    expect(enemy.speedMultiplier).toBe(0.5);
    expect(enemy.x).toBeCloseTo(1.75);

    const bat = new Enemy({ type: 'bat', def: enemies.bat, path: grid.pathToWorld(0) });
    bat.update(0.5, grid);
    expect(bat.speedMultiplier).toBe(1);
    expect(bat.x).toBeCloseTo(2.1);
  });

  it('takes damage and dies at zero hp', () => {
    const { enemy } = make('scout');
    expect(enemy.takeDamage(10)).toBe(false);
    expect(enemy.hp).toBe(20);
    expect(enemy.takeDamage(25)).toBe(true);
    expect(enemy.hp).toBe(0);
    expect(enemy.alive).toBe(false);
    expect(enemy.takeDamage(5)).toBe(false);
  });

  it('assigns increasing ids', () => {
    const a = make().enemy;
    const b = make().enemy;
    expect(b.id).toBeGreaterThan(a.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Enemy.test.js`
Expected: FAIL, cannot find `./Enemy.js`.

- [ ] **Step 3: Implement Enemy**

`client/src/game/Enemy.js`:
```js
let nextId = 1;

/** A troll walking a world-space waypoint path. Pure data + movement. */
export class Enemy {
  constructor({ type, def, path, hpMultiplier = 1, wave = 0, pathIndex = 0 }) {
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.wave = wave;
    this.pathIndex = pathIndex;
    this.maxHp = Math.round(def.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.flying = !!def.flying;
    this.gold = def.gold;
    this.score = def.score;
    this.livesCost = def.livesCost;

    this.path = path;
    this.segment = 0;
    this.segProgress = 0;
    this.segLengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
    this.totalLength = this.segLengths.reduce((a, b) => a + b, 0);
    this.traveled = 0;

    this.x = path[0].x;
    this.z = path[0].z;
    this.heading = 0;
    this.speedMultiplier = 1;
    this.alive = true;
    this.reachedBase = false;
    this.#updatePosition();
  }

  get distanceToBase() {
    return this.totalLength - this.traveled;
  }

  update(dt, grid) {
    if (!this.alive || this.reachedBase) return;
    const tile = grid.worldToTile(this.x, this.z);
    this.speedMultiplier = this.flying ? 1 : grid.speedMultiplierAt(tile.x, tile.y);
    let remaining = this.baseSpeed * this.speedMultiplier * dt;
    while (remaining > 0 && this.segment < this.segLengths.length) {
      const segLen = this.segLengths[this.segment];
      const left = segLen - this.segProgress;
      const step = Math.min(left, remaining);
      this.segProgress += step;
      this.traveled += step;
      remaining -= step;
      if (this.segProgress >= segLen - 1e-9) {
        this.segment++;
        this.segProgress = 0;
      }
    }
    this.#updatePosition();
    if (this.segment >= this.segLengths.length) {
      this.reachedBase = true;
      this.traveled = this.totalLength;
    }
  }

  #updatePosition() {
    if (this.segment >= this.segLengths.length) {
      const end = this.path[this.path.length - 1];
      this.x = end.x;
      this.z = end.z;
      return;
    }
    const a = this.path[this.segment];
    const b = this.path[this.segment + 1];
    const len = this.segLengths[this.segment];
    const t = len > 0 ? this.segProgress / len : 1;
    this.x = a.x + (b.x - a.x) * t;
    this.z = a.z + (b.z - a.z) * t;
    this.heading = Math.atan2(b.x - a.x, b.z - a.z);
  }

  /** Applies damage; returns true if this call killed the enemy. */
  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Enemy.test.js`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Enemy.js client/src/game/Enemy.test.js && git commit -m "feat(game): add Enemy path following and damage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Tower

**Files:**
- Create: `client/src/game/Tower.js`
- Test: `client/src/game/Tower.test.js`

**Interfaces:**
- Consumes: `Enemy` fields `x, z, alive, reachedBase, flying, distanceToBase`.
- Produces: `SELL_FACTOR = 0.7`; `class Tower({ type, def, tileX, tileY, world:{x,z} })` with fields `id, type, def, tileX, tileY, x, z, level, invested, cooldown, facing, targetId`; getters `stats, maxLevel, canUpgrade, upgradeCost, sellRefund`; methods `upgrade() → boolean`, `canTarget(enemy)`, `inRange(enemy)`, `enemiesInRange(enemies)`, `pickTarget(enemies)`, `update(dt, enemies) → actions[]`, `freezeSource() → {x,y,radius,slow}|null`.
- Action shapes: `{type:'fire', tower, target, damage, splashRadius, splashFactor}` and `{type:'areaTick', tower, targets, damage}`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Tower.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { Tower, SELL_FACTOR } from './Tower.js';
import { Enemy } from './Enemy.js';
import { Grid } from './Grid.js';
import { makeTestMap } from './testMap.js';
import towers from '../data/towers.json';
import enemies from '../data/enemies.json';

const grid = new Grid(makeTestMap());

function tower(type, tx = 2, ty = 0) {
  return new Tower({ type, def: towers[type], tileX: tx, tileY: ty, world: grid.tileToWorld(tx, ty) });
}

function enemyAt(type, x, z = 3) {
  const e = new Enemy({ type, def: enemies[type], path: [{ x, z }, { x: 11, z: 3 }] });
  return e;
}

describe('Tower economics', () => {
  it('starts at level 0 with the base cost invested', () => {
    const t = tower('crossbow');
    expect(t.level).toBe(0);
    expect(t.invested).toBe(50);
    expect(t.stats.damage).toBe(6);
    expect(t.upgradeCost).toBe(40);
    expect(t.sellRefund).toBe(Math.floor(50 * SELL_FACTOR));
  });

  it('upgrades twice and then refuses', () => {
    const t = tower('crossbow');
    expect(t.upgrade()).toBe(true);
    expect(t.level).toBe(1);
    expect(t.invested).toBe(90);
    expect(t.upgrade()).toBe(true);
    expect(t.invested).toBe(150);
    expect(t.canUpgrade).toBe(false);
    expect(t.upgradeCost).toBeNull();
    expect(t.upgrade()).toBe(false);
    expect(t.sellRefund).toBe(105);
  });
});

describe('Tower targeting', () => {
  it('picks the enemy closest to the base within range', () => {
    const t = tower('crossbow'); // at world (5,1), range 7
    const far = enemyAt('scout', 1); // distance to base 10
    const near = enemyAt('scout', 6); // distance to base 5
    const outOfRange = enemyAt('scout', 13); // 8 units away
    expect(t.pickTarget([far, near, outOfRange])).toBe(near);
  });

  it('ignores dead enemies and enemies that reached the base', () => {
    const t = tower('crossbow');
    const dead = enemyAt('scout', 5);
    dead.takeDamage(999);
    const done = enemyAt('scout', 5);
    done.reachedBase = true;
    expect(t.pickTarget([dead, done])).toBeNull();
  });

  it('spike towers cannot target flying enemies, crossbow can', () => {
    const bat = enemyAt('bat', 5);
    expect(tower('spike').canTarget(bat)).toBe(false);
    expect(tower('crossbow').canTarget(bat)).toBe(true);
    expect(tower('cannon').canTarget(bat)).toBe(true);
  });

  it('faces its target', () => {
    const t = tower('crossbow'); // world (5,1)
    t.update(0.01, [enemyAt('scout', 5, 3)]); // directly south (+z)
    expect(t.facing).toBeCloseTo(0);
    t.update(0.01, [enemyAt('scout', 9, 1)]); // directly east (+x)
    expect(t.facing).toBeCloseTo(Math.PI / 2);
  });
});

describe('Tower firing', () => {
  it('fires at its fire rate', () => {
    const t = tower('crossbow'); // 3 shots/s
    const target = enemyAt('scout', 5);
    let fires = 0;
    for (let i = 0; i < 100; i++) {
      for (const a of t.update(0.01, [target])) if (a.type === 'fire') fires++;
    }
    expect(fires).toBe(3);
    const a = t.update(1, [target])[0];
    expect(a).toMatchObject({ type: 'fire', target, damage: 6, splashRadius: 0 });
  });

  it('does not fire without a target and keeps the cooldown ready', () => {
    const t = tower('crossbow');
    expect(t.update(1, [])).toEqual([]);
    expect(t.update(0.01, [enemyAt('scout', 5)])).toHaveLength(1);
  });

  it('cannon actions carry splash info', () => {
    const t = tower('cannon');
    const a = t.update(0.01, [enemyAt('brute', 5)])[0];
    expect(a).toMatchObject({ type: 'fire', damage: 40, splashRadius: 2.5, splashFactor: 0.5 });
  });

  it('spike tower ticks every 0.5s against all ground enemies in range', () => {
    const t = tower('spike'); // at (5,1), range 3.5
    const a = enemyAt('scout', 5);
    const b = enemyAt('brute', 7);
    const bat = enemyAt('bat', 5);
    const far = enemyAt('scout', 10);
    let ticks = 0;
    let lastTargets = null;
    for (let i = 0; i < 100; i++) {
      for (const act of t.update(0.01, [a, b, bat, far])) {
        if (act.type === 'areaTick') {
          ticks++;
          lastTargets = act.targets;
        }
      }
    }
    expect(ticks).toBe(2);
    expect(lastTargets).toEqual([a, b]);
  });

  it('frozen towers never fire but expose a freeze source', () => {
    const t = tower('frozen');
    expect(t.update(1, [enemyAt('scout', 5)])).toEqual([]);
    expect(t.freezeSource()).toEqual({ x: 2, y: 0, radius: 1, slow: 0.5 });
    t.upgrade();
    expect(t.freezeSource().radius).toBe(2);
    expect(tower('crossbow').freezeSource()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Tower.test.js`
Expected: FAIL, cannot find `./Tower.js`.

- [ ] **Step 3: Implement Tower**

`client/src/game/Tower.js`:
```js
let nextId = 1;

export const SELL_FACTOR = 0.7;

/** A placed tower. Handles targeting, cooldowns and level math. Damage is applied by Game. */
export class Tower {
  constructor({ type, def, tileX, tileY, world }) {
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.tileX = tileX;
    this.tileY = tileY;
    this.x = world.x;
    this.z = world.z;
    this.level = 0;
    this.invested = def.levels[0].cost;
    this.cooldown = 0;
    this.facing = 0;
    this.targetId = null;
  }

  get stats() {
    return this.def.levels[this.level];
  }

  get maxLevel() {
    return this.def.levels.length - 1;
  }

  get canUpgrade() {
    return this.level < this.maxLevel;
  }

  get upgradeCost() {
    return this.canUpgrade ? this.def.levels[this.level + 1].cost : null;
  }

  get sellRefund() {
    return Math.floor(this.invested * SELL_FACTOR);
  }

  upgrade() {
    if (!this.canUpgrade) return false;
    this.level++;
    this.invested += this.stats.cost;
    return true;
  }

  distanceTo(enemy) {
    return Math.hypot(enemy.x - this.x, enemy.z - this.z);
  }

  canTarget(enemy) {
    if (!enemy.alive || enemy.reachedBase) return false;
    return enemy.flying ? !!this.def.hitsFlying : this.def.hitsGround !== false;
  }

  inRange(enemy) {
    return this.distanceTo(enemy) <= this.stats.range;
  }

  enemiesInRange(enemies) {
    return enemies.filter((e) => this.canTarget(e) && this.inRange(e));
  }

  /** "First" targeting: the enemy in range that is closest to the base. */
  pickTarget(enemies) {
    let best = null;
    for (const e of this.enemiesInRange(enemies)) {
      if (!best || e.distanceToBase < best.distanceToBase) best = e;
    }
    return best;
  }

  update(dt, enemies) {
    const actions = [];
    this.cooldown = Math.max(0, this.cooldown - dt);
    const kind = this.def.kind;
    if (kind === 'projectile') {
      const target = this.pickTarget(enemies);
      this.targetId = target?.id ?? null;
      if (target) {
        this.facing = Math.atan2(target.x - this.x, target.z - this.z);
        if (this.cooldown === 0) {
          this.cooldown = 1 / this.stats.fireRate;
          actions.push({
            type: 'fire',
            tower: this,
            target,
            damage: this.stats.damage,
            splashRadius: this.stats.splashRadius ?? 0,
            splashFactor: this.stats.splashFactor ?? 0,
          });
        }
      }
    } else if (kind === 'area') {
      if (this.cooldown === 0) {
        const targets = this.enemiesInRange(enemies);
        if (targets.length > 0) {
          this.cooldown = this.stats.tickInterval;
          actions.push({ type: 'areaTick', tower: this, targets, damage: this.stats.damage });
        }
      }
    }
    return actions;
  }

  freezeSource() {
    if (this.def.kind !== 'freeze') return null;
    return { x: this.tileX, y: this.tileY, radius: this.stats.freezeRadius, slow: this.stats.slow };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Tower.test.js`
Expected: 11 passed. (If "fires at its fire rate" reports 4 instead of 3 because of floating-point drift in `0.01` steps, change the loop to accumulate `dt = 1 / 100` and keep the expectation at 3; the cooldown is exactly `1/3` s, so shots land at t=0, 0.34, 0.67 and the 4th would be at 1.00, which the 100 × 0.01 loop must not reach.)

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Tower.js client/src/game/Tower.test.js && git commit -m "feat(game): add Tower targeting, firing and level math

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Economy

**Files:**
- Create: `client/src/game/Economy.js`
- Test: `client/src/game/Economy.test.js`

**Interfaces:**
- Produces: `class Economy({ gold=0, lives=20 })` with fields `gold, score, lives`; methods `canAfford(cost)`, `spend(cost) → boolean`, `earn({gold=0, score=0})`, `loseLives(n) → dead:boolean`, `snapshot() → {gold, score, lives}`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Economy.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { Economy } from './Economy.js';

describe('Economy', () => {
  it('starts with the given gold and lives and zero score', () => {
    const e = new Economy({ gold: 200, lives: 20 });
    expect(e.snapshot()).toEqual({ gold: 200, score: 0, lives: 20 });
  });

  it('spends only when affordable', () => {
    const e = new Economy({ gold: 100 });
    expect(e.spend(60)).toBe(true);
    expect(e.gold).toBe(40);
    expect(e.spend(50)).toBe(false);
    expect(e.gold).toBe(40);
    expect(e.canAfford(40)).toBe(true);
  });

  it('earns gold and score independently', () => {
    const e = new Economy({ gold: 0 });
    e.earn({ gold: 5, score: 10 });
    e.earn({ score: 50 });
    e.earn({ gold: 20 });
    expect(e.snapshot()).toEqual({ gold: 25, score: 60, lives: 20 });
  });

  it('loses lives, floors at zero and reports death', () => {
    const e = new Economy({ gold: 0, lives: 3 });
    expect(e.loseLives(2)).toBe(false);
    expect(e.loseLives(5)).toBe(true);
    expect(e.lives).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Economy.test.js`
Expected: FAIL, cannot find `./Economy.js`.

- [ ] **Step 3: Implement Economy**

`client/src/game/Economy.js`:
```js
/** Gold (spendable), score (highscore) and base lives. */
export class Economy {
  constructor({ gold = 0, lives = 20 } = {}) {
    this.gold = gold;
    this.score = 0;
    this.lives = lives;
  }

  canAfford(cost) {
    return this.gold >= cost;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    return true;
  }

  earn({ gold = 0, score = 0 } = {}) {
    this.gold += gold;
    this.score += score;
  }

  /** Returns true when lives hit zero. */
  loseLives(n) {
    this.lives = Math.max(0, this.lives - n);
    return this.lives === 0;
  }

  snapshot() {
    return { gold: this.gold, score: this.score, lives: this.lives };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Economy.test.js`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Economy.js client/src/game/Economy.test.js && git commit -m "feat(game): add Economy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Waves and endless generator

**Files:**
- Create: `client/src/game/Wave.js`
- Test: `client/src/game/Wave.test.js`

**Interfaces:**
- Produces: `hpMultiplier(wave)`, `waveBonus(wave) → {gold:20, score:50*wave}`, `buildSchedule(waveDef) → [{at, type, path}]` sorted by `at`, `class WaveRun(number, waveDef)` with `number, early, spawningDone` and `update(dt) → due[]`, `generateEndlessWave(n, pathCount=1, rng=Math.random) → {spawns:[...]}`, `ENDLESS_MIX`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Wave.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { hpMultiplier, waveBonus, buildSchedule, WaveRun, generateEndlessWave, ENDLESS_MIX } from './Wave.js';

describe('formulas', () => {
  it('scales hp by 6% per wave after the first', () => {
    expect(hpMultiplier(1)).toBe(1);
    expect(hpMultiplier(11)).toBeCloseTo(1.6);
  });

  it('gives 20 gold and 50 x wave score', () => {
    expect(waveBonus(1)).toEqual({ gold: 20, score: 50 });
    expect(waveBonus(20)).toEqual({ gold: 20, score: 1000 });
  });
});

describe('buildSchedule', () => {
  it('expands counts, intervals and delays into a sorted timeline', () => {
    const s = buildSchedule({
      spawns: [
        { type: 'brute', count: 2, interval: 2, delay: 1, path: 1 },
        { type: 'scout', count: 3, interval: 0.5 },
      ],
    });
    expect(s).toEqual([
      { at: 0, type: 'scout', path: 0 },
      { at: 0.5, type: 'scout', path: 0 },
      { at: 1, type: 'brute', path: 1 },
      { at: 1, type: 'scout', path: 0 },
      { at: 3, type: 'brute', path: 1 },
    ]);
  });
});

describe('WaveRun', () => {
  it('releases spawns as time passes', () => {
    const run = new WaveRun(3, { spawns: [{ type: 'scout', count: 3, interval: 1 }] });
    expect(run.number).toBe(3);
    expect(run.update(0).map((s) => s.type)).toEqual(['scout']);
    expect(run.update(0.5)).toEqual([]);
    expect(run.update(0.5)).toHaveLength(1);
    expect(run.spawningDone).toBe(false);
    expect(run.update(5)).toHaveLength(1);
    expect(run.spawningDone).toBe(true);
    expect(run.update(5)).toEqual([]);
  });
});

describe('generateEndlessWave', () => {
  const cost = Object.fromEntries(ENDLESS_MIX.map((m) => [m.type, m.cost]));

  it('spends exactly the budget 40 + 8n on non-boss enemies', () => {
    for (const n of [21, 25, 33]) {
      const wave = generateEndlessWave(n, 1, () => 0.3);
      const spent = wave.spawns.filter((s) => s.type !== 'boss').reduce((sum, s) => sum + cost[s.type] * s.count, 0);
      expect(spent).toBe(40 + 8 * n);
    }
  });

  it('adds bosses only every 10th wave', () => {
    expect(generateEndlessWave(21, 1, () => 0.1).spawns.some((s) => s.type === 'boss')).toBe(false);
    const w30 = generateEndlessWave(30, 1, () => 0.1);
    expect(w30.spawns.find((s) => s.type === 'boss').count).toBe(2);
  });

  it('is deterministic for a given rng and spreads spawns across paths', () => {
    const rng = () => 0.9; // always picks the last (brute) entry
    const a = generateEndlessWave(22, 2, rng);
    const b = generateEndlessWave(22, 2, rng);
    expect(a).toEqual(b);
    expect(a.spawns.every((s) => s.path < 2)).toBe(true);
  });

  it('produces valid spawn entries', () => {
    const wave = generateEndlessWave(41, 2);
    for (const s of wave.spawns) {
      expect(s.count).toBeGreaterThan(0);
      expect(s.interval).toBeGreaterThan(0);
      expect(['scout', 'bat', 'brute', 'boss']).toContain(s.type);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Wave.test.js`
Expected: FAIL, cannot find `./Wave.js`.

- [ ] **Step 3: Implement Wave.js**

`client/src/game/Wave.js`:
```js
export function hpMultiplier(wave) {
  return 1 + 0.06 * (wave - 1);
}

export function waveBonus(wave) {
  return { gold: 20, score: 50 * wave };
}

/** Expands a wave definition into a sorted list of {at, type, path}. */
export function buildSchedule(waveDef) {
  const out = [];
  for (const s of waveDef.spawns) {
    const delay = s.delay ?? 0;
    const path = s.path ?? 0;
    for (let i = 0; i < s.count; i++) out.push({ at: delay + i * s.interval, type: s.type, path });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** One wave in flight: releases spawns as its clock advances. */
export class WaveRun {
  constructor(number, waveDef) {
    this.number = number;
    this.schedule = buildSchedule(waveDef);
    this.time = 0;
    this.index = 0;
    this.early = false;
  }

  get spawningDone() {
    return this.index >= this.schedule.length;
  }

  update(dt) {
    this.time += dt;
    const due = [];
    while (this.index < this.schedule.length && this.schedule[this.index].at <= this.time + 1e-9) {
      due.push(this.schedule[this.index]);
      this.index++;
    }
    return due;
  }
}

export const ENDLESS_MIX = [
  { type: 'scout', weight: 0.5, cost: 1, interval: 0.5 },
  { type: 'bat', weight: 0.25, cost: 2, interval: 0.8 },
  { type: 'brute', weight: 0.25, cost: 3, interval: 1.2 },
];

/** Generates wave n (> 20) from a budget of 40 + 8n, boss every 10th wave. */
export function generateEndlessWave(n, pathCount = 1, rng = Math.random) {
  let budget = 40 + 8 * n;
  const counts = Object.fromEntries(ENDLESS_MIX.map((m) => [m.type, 0]));
  while (budget > 0) {
    const r = rng();
    let acc = 0;
    let pick = ENDLESS_MIX[0];
    for (const m of ENDLESS_MIX) {
      acc += m.weight;
      if (r < acc) {
        pick = m;
        break;
      }
    }
    if (pick.cost > budget) pick = ENDLESS_MIX[0];
    counts[pick.type]++;
    budget -= pick.cost;
  }
  const spawns = [];
  let delay = 0;
  for (const m of ENDLESS_MIX) {
    const count = counts[m.type];
    if (count === 0) continue;
    spawns.push({ type: m.type, count, interval: m.interval, delay, path: spawns.length % pathCount });
    delay += 2;
  }
  if (n % 10 === 0) {
    spawns.push({ type: 'boss', count: Math.max(1, Math.floor(n / 10) - 1), interval: 5, delay: 1, path: 0 });
  }
  return { spawns };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Wave.test.js`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Wave.js client/src/game/Wave.test.js && git commit -m "feat(game): add wave scheduling and endless generator

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Game facade

**Files:**
- Create: `client/src/game/Game.js`
- Test: `client/src/game/Game.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2, 4, 6–10.
- Produces: `AUTO_WAVE_DELAY = 10`; `class Game extends Emitter`, constructed with `{ map, towerDefs, enemyDefs, rng? }`. Fields: `map, grid, economy, enemies[], towers[], wave, totalWaves, endless, state ('idle'|'running'|'won'|'lost'), autoWave, countdown (seconds or null), pathsWorld`. Getters `isOver`, `canStartWave`. Methods: `update(dt)`, `startNextWave() → boolean`, `startEndless() → boolean`, `setAutoWave(bool)`, `buildTower(type, tx, ty) → {ok, tower?|error}`, `upgradeTower(id) → {ok, tower?|error}`, `sellTower(id) → {ok, refund?|error}`, `towerAt(tx, ty) → Tower|null`.
- Error codes: `'gameOver' | 'unknownTower' | 'notBuildable' | 'notEnoughGold' | 'noTower' | 'maxLevel'`.
- Events emitted (payloads): `wave:started {wave, early, endless}`, `wave:ended {wave, bonusGold, bonusScore, early}`, `enemy:spawned {enemy}`, `enemy:hit {enemy, damage, towerType}`, `enemy:died {enemy, gold, score}`, `enemy:reachedBase {enemy, livesLost}`, `tower:built {tower}`, `tower:upgraded {tower}`, `tower:sold {tower, refund}`, `tower:fired {tower, target, projectile}` (`target` null and `projectile:'spikes'` for area ticks), `tile:frozenChanged {tiles, changed}`, `economy:changed {gold, score, lives}`, `game:won {score, wave}`, `game:lost {score, wave}`, `endless:started {wave}`.

- [ ] **Step 1: Write the failing tests**

`client/src/game/Game.test.js`:
```js
import { describe, it, expect, vi } from 'vitest';
import { Game, AUTO_WAVE_DELAY } from './Game.js';
import { makeTestMap } from './testMap.js';
import towers from '../data/towers.json';
import enemies from '../data/enemies.json';

function makeGame(overrides = {}) {
  return new Game({ map: makeTestMap(overrides), towerDefs: towers, enemyDefs: enemies, rng: () => 0.3 });
}

/** Advance the simulation in fixed steps. */
function run(game, seconds, step = 0.05) {
  for (let t = 0; t < seconds; t += step) game.update(step);
}

describe('Game building', () => {
  it('builds a tower on a buildable tile and charges gold', () => {
    const g = makeGame();
    const built = vi.fn();
    g.on('tower:built', built);
    const r = g.buildTower('crossbow', 2, 0);
    expect(r.ok).toBe(true);
    expect(g.economy.gold).toBe(450);
    expect(g.towerAt(2, 0)).toBe(r.tower);
    expect(built).toHaveBeenCalledWith({ tower: r.tower });
  });

  it('refuses roads, occupied tiles, unknown towers and empty wallets', () => {
    const g = makeGame({ startGold: 60 });
    expect(g.buildTower('crossbow', 2, 1)).toEqual({ ok: false, error: 'notBuildable' });
    expect(g.buildTower('dragon', 2, 0)).toEqual({ ok: false, error: 'unknownTower' });
    expect(g.buildTower('cannon', 2, 0)).toEqual({ ok: false, error: 'notEnoughGold' });
    expect(g.buildTower('crossbow', 2, 0).ok).toBe(true);
    expect(g.buildTower('crossbow', 2, 0)).toEqual({ ok: false, error: 'notBuildable' });
  });

  it('upgrades and sells towers', () => {
    const g = makeGame();
    const { tower } = g.buildTower('crossbow', 2, 0);
    expect(g.upgradeTower(tower.id).ok).toBe(true);
    expect(g.economy.gold).toBe(410);
    expect(g.upgradeTower(999)).toEqual({ ok: false, error: 'noTower' });
    const sold = g.sellTower(tower.id);
    expect(sold).toEqual({ ok: true, refund: 63 });
    expect(g.economy.gold).toBe(473);
    expect(g.towerAt(2, 0)).toBeNull();
    expect(g.grid.isBuildable(2, 0)).toBe(true);
  });

  it('freezes road tiles when a frozen tower is built and thaws when sold', () => {
    const g = makeGame();
    const frozen = vi.fn();
    g.on('tile:frozenChanged', frozen);
    const { tower } = g.buildTower('frozen', 2, 0);
    expect(g.grid.speedMultiplierAt(2, 1)).toBe(0.5);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen.mock.calls[0][0].tiles).toHaveLength(3);
    g.upgradeTower(tower.id);
    expect(g.grid.frozenTiles()).toHaveLength(5);
    g.sellTower(tower.id);
    expect(g.grid.frozenTiles()).toHaveLength(0);
    expect(frozen).toHaveBeenCalledTimes(3);
  });
});

describe('Game waves', () => {
  it('spawns enemies when a wave starts and ends the wave when they are gone', () => {
    const g = makeGame();
    const started = vi.fn();
    const ended = vi.fn();
    g.on('wave:started', started);
    g.on('wave:ended', ended);
    g.buildTower('cannon', 2, 0);
    expect(g.startNextWave()).toBe(true);
    expect(g.wave).toBe(1);
    expect(g.state).toBe('running');
    expect(started).toHaveBeenCalledWith({ wave: 1, early: false, endless: false });
    const spawned = vi.fn();
    g.on('enemy:spawned', spawned);
    g.update(0.05); // the cannon kills the scout in this same tick, so check the spawn event
    expect(spawned).toHaveBeenCalledTimes(1);
    run(g, 5);
    expect(g.enemies).toHaveLength(0);
    expect(ended).toHaveBeenCalledWith({ wave: 1, bonusGold: 20, bonusScore: 50, early: false });
    expect(g.state).toBe('idle');
    expect(g.countdown).toBeGreaterThan(0);
    expect(g.countdown).toBeLessThanOrEqual(AUTO_WAVE_DELAY);
    expect(g.economy.score).toBe(60); // 10 kill + 50 wave bonus
    expect(g.economy.gold).toBe(500 - 150 + 5 + 20);
  });

  it('lets enemies through when there are no towers and costs lives', () => {
    const g = makeGame();
    const reached = vi.fn();
    g.on('enemy:reachedBase', reached);
    g.startNextWave();
    run(g, 6);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(g.economy.lives).toBe(19);
    expect(g.enemies).toHaveLength(0);
  });

  it('loses the game when lives reach zero', () => {
    const g = makeGame({
      waves: makeTestMap().waves.map(() => ({ spawns: [{ type: 'boss', count: 4, interval: 0.1 }] })),
    });
    const lost = vi.fn();
    g.on('game:lost', lost);
    g.startNextWave();
    run(g, 20);
    expect(g.state).toBe('lost');
    expect(lost).toHaveBeenCalledWith({ score: 0, wave: 1 });
    expect(g.startNextWave()).toBe(false);
  });

  it('adds 10% score bonus for calling the next wave early', () => {
    const g = makeGame();
    const ended = vi.fn();
    g.on('wave:ended', ended);
    g.buildTower('crossbow', 2, 0); // crossbow needs ~1.4s to kill a scout, so wave 1 is still alive
    g.startNextWave();
    g.update(0.05); // enemy 1 alive
    expect(g.startNextWave()).toBe(true);
    expect(g.wave).toBe(2);
    run(g, 6);
    expect(ended).toHaveBeenCalledTimes(2);
    expect(ended.mock.calls[0][0]).toMatchObject({ wave: 1, early: false, bonusScore: 50 });
    expect(ended.mock.calls[1][0]).toMatchObject({ wave: 2, early: true, bonusScore: 110 });
  });

  it('auto-starts the next wave after the countdown when enabled', () => {
    const g = makeGame();
    g.buildTower('cannon', 2, 0);
    g.setAutoWave(true);
    g.startNextWave();
    run(g, 5);
    expect(g.state).toBe('idle');
    run(g, AUTO_WAVE_DELAY + 0.1);
    expect(g.wave).toBe(2); // wave 2 auto-started (and the cannon may already have finished it)
  });

  it('wins after wave 20 and can continue into endless', () => {
    const g = makeGame();
    const won = vi.fn();
    g.on('game:won', won);
    g.buildTower('cannon', 2, 0);
    g.buildTower('cannon', 3, 2);
    for (let w = 1; w <= 20; w++) {
      expect(g.startNextWave()).toBe(true);
      run(g, 6);
    }
    expect(g.state).toBe('won');
    expect(won).toHaveBeenCalledTimes(1);
    expect(won.mock.calls[0][0].wave).toBe(20);
    expect(g.startNextWave()).toBe(false);
    expect(g.startEndless()).toBe(true);
    expect(g.state).toBe('idle');
    const started = vi.fn();
    g.on('wave:started', started);
    expect(g.startNextWave()).toBe(true);
    expect(started).toHaveBeenCalledWith({ wave: 21, early: false, endless: true });
    const spawned = vi.fn();
    g.on('enemy:spawned', spawned);
    g.update(0.05);
    expect(spawned).toHaveBeenCalled();
    const first = spawned.mock.calls[0][0].enemy;
    expect(first.type).toBe('scout'); // rng 0.3 always picks the scout entry
    expect(first.maxHp).toBe(Math.round(enemies.scout.hp * (1 + 0.06 * 20)));
  });

  it('cannon splash damages nearby enemies and spike towers tick', () => {
    const g = makeGame({ waves: makeTestMap().waves.map(() => ({ spawns: [{ type: 'brute', count: 3, interval: 0.2 }] })) });
    const hits = vi.fn();
    g.on('enemy:hit', hits);
    g.buildTower('cannon', 5, 0);
    g.buildTower('spike', 0, 0);
    g.startNextWave();
    run(g, 1.5);
    const types = new Set(hits.mock.calls.map((c) => c[0].towerType));
    expect(types.has('cannon')).toBe(true);
    expect(types.has('spike')).toBe(true);
    const cannonHitsInOneShot = hits.mock.calls.filter((c) => c[0].towerType === 'cannon' && c[0].damage === 20);
    expect(cannonHitsInOneShot.length).toBeGreaterThan(0);
  });

  it('rejects an invalid map at construction', () => {
    expect(() => makeGame({ base: [0, 0] })).toThrow(/base must be on a road tile/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Game.test.js`
Expected: FAIL, cannot find `./Game.js`.

- [ ] **Step 3: Implement Game**

`client/src/game/Game.js`:
```js
import { Emitter } from './events.js';
import { Grid } from './Grid.js';
import { Enemy } from './Enemy.js';
import { Tower } from './Tower.js';
import { Economy } from './Economy.js';
import { WaveRun, generateEndlessWave, hpMultiplier, waveBonus } from './Wave.js';
import { validateMap } from './validateMap.js';

export const AUTO_WAVE_DELAY = 10;
export const START_LIVES = 20;
export const EARLY_WAVE_BONUS = 0.1;

/** The whole simulation. No rendering, no DOM. */
export class Game extends Emitter {
  constructor({ map, towerDefs, enemyDefs, rng = Math.random }) {
    super();
    validateMap(map, enemyDefs);
    this.map = map;
    this.towerDefs = towerDefs;
    this.enemyDefs = enemyDefs;
    this.rng = rng;
    this.grid = new Grid(map);
    this.economy = new Economy({ gold: map.startGold, lives: START_LIVES });
    this.enemies = [];
    this.towers = [];
    this.activeWaves = [];
    this.wave = 0;
    this.totalWaves = map.waves.length;
    this.endless = false;
    this.state = 'idle';
    this.autoWave = false;
    this.countdown = null;
    this.time = 0;
    this.pathsWorld = map.paths.map((_, i) => this.grid.pathToWorld(i));
  }

  get isOver() {
    return this.state === 'won' || this.state === 'lost';
  }

  get canStartWave() {
    return !this.isOver && (this.endless || this.wave < this.totalWaves);
  }

  setAutoWave(on) {
    this.autoWave = !!on;
  }

  startNextWave() {
    if (!this.canStartWave) return false;
    const early = this.activeWaves.length > 0;
    this.wave++;
    this.countdown = null;
    const endless = this.wave > this.totalWaves;
    const def = endless
      ? generateEndlessWave(this.wave, this.map.paths.length, this.rng)
      : this.map.waves[this.wave - 1];
    const run = new WaveRun(this.wave, def);
    run.early = early;
    this.activeWaves.push(run);
    this.state = 'running';
    this.emit('wave:started', { wave: this.wave, early, endless });
    return true;
  }

  startEndless() {
    if (this.state !== 'won') return false;
    this.endless = true;
    this.state = 'idle';
    this.countdown = AUTO_WAVE_DELAY;
    this.emit('endless:started', { wave: this.wave });
    return true;
  }

  update(dt) {
    if (this.isOver) return;
    this.time += dt;

    for (const run of this.activeWaves) {
      for (const s of run.update(dt)) this.#spawn(s, run.number);
    }

    for (const e of this.enemies) {
      if (!e.alive || e.reachedBase) continue;
      e.update(dt, this.grid);
      if (e.reachedBase) {
        const dead = this.economy.loseLives(e.livesCost);
        this.emit('enemy:reachedBase', { enemy: e, livesLost: e.livesCost });
        this.#emitEconomy();
        if (dead) {
          this.#end('lost');
          return;
        }
      }
    }

    for (const t of this.towers) {
      for (const action of t.update(dt, this.enemies)) this.#applyAction(action);
    }

    this.enemies = this.enemies.filter((e) => e.alive && !e.reachedBase);

    for (const run of [...this.activeWaves]) {
      if (run.spawningDone && !this.enemies.some((e) => e.wave === run.number)) this.#endWave(run);
    }

    if (this.state === 'idle' && this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = null;
        if (this.autoWave) this.startNextWave();
      }
    }
  }

  towerAt(tx, ty) {
    const id = this.grid.towerIdAt(tx, ty);
    return id === null ? null : (this.towers.find((t) => t.id === id) ?? null);
  }

  buildTower(type, tx, ty) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const def = this.towerDefs[type];
    if (!def) return { ok: false, error: 'unknownTower' };
    if (!this.grid.isBuildable(tx, ty)) return { ok: false, error: 'notBuildable' };
    if (!this.economy.spend(def.levels[0].cost)) return { ok: false, error: 'notEnoughGold' };
    const tower = new Tower({ type, def, tileX: tx, tileY: ty, world: this.grid.tileToWorld(tx, ty) });
    this.towers.push(tower);
    this.grid.occupy(tx, ty, tower.id);
    this.emit('tower:built', { tower });
    this.#emitEconomy();
    if (def.kind === 'freeze') this.#refreeze();
    return { ok: true, tower };
  }

  upgradeTower(id) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const tower = this.towers.find((t) => t.id === id);
    if (!tower) return { ok: false, error: 'noTower' };
    if (!tower.canUpgrade) return { ok: false, error: 'maxLevel' };
    if (!this.economy.spend(tower.upgradeCost)) return { ok: false, error: 'notEnoughGold' };
    tower.upgrade();
    this.emit('tower:upgraded', { tower });
    this.#emitEconomy();
    if (tower.def.kind === 'freeze') this.#refreeze();
    return { ok: true, tower };
  }

  sellTower(id) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const tower = this.towers.find((t) => t.id === id);
    if (!tower) return { ok: false, error: 'noTower' };
    const refund = tower.sellRefund;
    this.towers = this.towers.filter((t) => t !== tower);
    this.grid.release(tower.tileX, tower.tileY);
    this.economy.earn({ gold: refund });
    this.emit('tower:sold', { tower, refund });
    this.#emitEconomy();
    if (tower.def.kind === 'freeze') this.#refreeze();
    return { ok: true, refund };
  }

  #spawn(s, wave) {
    const def = this.enemyDefs[s.type];
    const enemy = new Enemy({
      type: s.type,
      def,
      path: this.pathsWorld[s.path],
      hpMultiplier: hpMultiplier(wave),
      wave,
      pathIndex: s.path,
    });
    this.enemies.push(enemy);
    this.emit('enemy:spawned', { enemy });
  }

  #applyAction(a) {
    if (a.type === 'fire') {
      this.emit('tower:fired', { tower: a.tower, target: a.target, projectile: a.tower.def.projectile });
      const target = a.target;
      this.#damage(target, a.damage, a.tower);
      if (a.splashRadius > 0) {
        for (const e of this.enemies) {
          if (e === target || !a.tower.canTarget(e)) continue;
          if (Math.hypot(e.x - target.x, e.z - target.z) <= a.splashRadius) {
            this.#damage(e, Math.round(a.damage * a.splashFactor), a.tower);
          }
        }
      }
    } else if (a.type === 'areaTick') {
      this.emit('tower:fired', { tower: a.tower, target: null, projectile: 'spikes' });
      for (const e of a.targets) this.#damage(e, a.damage, a.tower);
    }
  }

  #damage(enemy, amount, tower) {
    if (!enemy.alive) return;
    const died = enemy.takeDamage(amount);
    this.emit('enemy:hit', { enemy, damage: amount, towerType: tower.type });
    if (died) {
      this.economy.earn({ gold: enemy.gold, score: enemy.score });
      this.emit('enemy:died', { enemy, gold: enemy.gold, score: enemy.score });
      this.#emitEconomy();
    }
  }

  #endWave(run) {
    this.activeWaves = this.activeWaves.filter((r) => r !== run);
    const bonus = waveBonus(run.number);
    const score = run.early ? bonus.score + Math.round(bonus.score * EARLY_WAVE_BONUS) : bonus.score;
    this.economy.earn({ gold: bonus.gold, score });
    this.emit('wave:ended', { wave: run.number, bonusGold: bonus.gold, bonusScore: score, early: run.early });
    this.#emitEconomy();
    if (this.activeWaves.length === 0) {
      if (!this.endless && this.wave >= this.totalWaves) {
        this.#end('won');
      } else {
        this.state = 'idle';
        this.countdown = AUTO_WAVE_DELAY;
      }
    }
  }

  #end(state) {
    this.state = state;
    this.countdown = null;
    this.emit(state === 'won' ? 'game:won' : 'game:lost', { score: this.economy.score, wave: this.wave });
  }

  #emitEconomy() {
    this.emit('economy:changed', this.economy.snapshot());
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/game/Game.test.js`
Expected: 12 passed. If "loses the game" does not reach `lost` within 20 s, check that four bosses (5 lives each, 20 total) all reach the base: boss speed 1.0 over 10 units takes 10 s plus 0.3 s spawn spread, so 20 s is enough.

- [ ] **Step 5: Run the whole suite**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm test`
Expected: all test files pass.

- [ ] **Step 6: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/game/Game.js client/src/game/Game.test.js && git commit -m "feat(game): add Game facade wiring waves, towers, enemies and economy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: i18n

**Files:**
- Create: `client/src/i18n/en.json`, `client/src/i18n/i18n.js`
- Test: `client/src/i18n/i18n.test.js`

**Interfaces:**
- Produces: `await loadLanguage('en')`, `t(key, params?) → string` (unknown key returns the key itself; `{name}` placeholders are replaced), `currentLanguage()`.

- [ ] **Step 1: Write the failing test**

`client/src/i18n/i18n.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadLanguage, t, currentLanguage } from './i18n.js';
import en from './en.json';

describe('i18n', () => {
  beforeAll(async () => {
    await loadLanguage('en');
  });

  it('loads english and looks up keys', () => {
    expect(currentLanguage()).toBe('en');
    expect(t('hud.gold')).toBe('Gold');
  });

  it('substitutes placeholders', () => {
    expect(t('hud.wave', { wave: 3, total: 20 })).toBe('Wave 3 / 20');
  });

  it('returns the key for unknown strings', () => {
    expect(t('nope.missing')).toBe('nope.missing');
  });

  it('has a name key for every tower and enemy', () => {
    for (const id of ['crossbow', 'spike', 'cannon', 'frozen']) expect(en[`tower.${id}.name`]).toBeTruthy();
    for (const id of ['scout', 'brute', 'bat', 'boss']) expect(en[`enemy.${id}.name`]).toBeTruthy();
    for (const id of ['green', 'snow', 'desert', 'water']) expect(en[`map.${id}.name`]).toBeTruthy();
  });

  it('rejects unknown languages', async () => {
    await expect(loadLanguage('xx')).rejects.toThrow(/unknown language/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/i18n`
Expected: FAIL, cannot find `./i18n.js`.

- [ ] **Step 3: Write en.json**

`client/src/i18n/en.json`:
```json
{
  "app.title": "Troll Towers",
  "app.subtitle": "Cartoon tower defence. Keep the trolls out!",
  "app.loading": "Loading…",
  "app.webglMissing": "Your browser could not start WebGL, which this game needs. Try a current version of Chrome, Firefox, Edge or Safari.",

  "menu.chooseMap": "Choose a map",
  "menu.play": "Play",
  "menu.highscores": "Highscores",
  "menu.personalBest": "Your best: {score}",
  "menu.noBest": "Not played yet",
  "menu.unavailable": "Map unavailable",
  "menu.back": "Back",
  "menu.howTo": "Left-click a tile to build. Drag to rotate, scroll to zoom. Press Esc to close panels.",

  "map.green.name": "Green Meadows",
  "map.green.description": "Rolling hills and a long lazy road. A good place to start.",
  "map.snow.name": "Frosty Peaks",
  "map.snow.description": "A long winding mountain road. Frozen towers bite harder up here.",
  "map.desert.name": "Dusty Dunes",
  "map.desert.description": "A short, fast road through the sand. The trolls arrive quickly.",
  "map.water.name": "Soggy Swamp",
  "map.water.description": "Two roads, little dry land. Every build spot counts.",

  "hud.gold": "Gold",
  "hud.score": "Score",
  "hud.lives": "Lives",
  "hud.wave": "Wave {wave} / {total}",
  "hud.waveEndless": "Endless wave {wave}",
  "hud.nextWave": "Next wave",
  "hud.nextWaveIn": "Next wave ({seconds}s)",
  "hud.callEarly": "Call early (+10% bonus)",
  "hud.auto": "Auto",
  "hud.speed": "Speed {speed}×",
  "hud.menu": "Menu",
  "hud.waveIncoming": "Wave {wave} incoming!",
  "hud.waveCleared": "Wave {wave} cleared! +{gold} gold, +{score} score",

  "build.title": "Build on ({x}, {y})",
  "build.cost": "{cost} gold",
  "build.tooExpensive": "Not enough gold",
  "build.towerTitle": "{name} (Level {level})",
  "build.upgrade": "Upgrade ({cost} gold)",
  "build.maxLevel": "Max level",
  "build.sell": "Sell (+{refund} gold)",
  "build.stat.damage": "Damage",
  "build.stat.fireRate": "Shots / s",
  "build.stat.range": "Range",
  "build.stat.tickInterval": "Tick every",
  "build.stat.freezeRadius": "Freeze reach",
  "build.stat.slow": "Slow",
  "build.close": "Close",

  "tower.crossbow.name": "Crossbow Tower",
  "tower.crossbow.blurb": "Fast, weak arrows. Hits flying trolls.",
  "tower.spike.name": "Spike Tower",
  "tower.spike.blurb": "Spikes pop up and hurt everything nearby on the ground.",
  "tower.cannon.name": "Cannon Tower",
  "tower.cannon.blurb": "Slow but devastating. Splash damage.",
  "tower.frozen.name": "Frozen Ice Block",
  "tower.frozen.blurb": "Leaks icy water onto nearby roads. Slows walking trolls.",

  "enemy.scout.name": "Scout Troll",
  "enemy.brute.name": "Brute Troll",
  "enemy.bat.name": "Bat Troll",
  "enemy.boss.name": "Boss Troll",

  "end.wonTitle": "Map cleared!",
  "end.lostTitle": "The trolls got through…",
  "end.score": "Score: {score}",
  "end.wave": "Reached wave {wave}",
  "end.namePlaceholder": "Your name",
  "end.submit": "Submit score",
  "end.submitted": "Score saved! Rank #{rank}",
  "end.submittedOffline": "Saved offline, will upload later",
  "end.continueEndless": "Continue in Endless",
  "end.backToMenu": "Back to menu",
  "end.playAgain": "Play again",

  "scores.title": "Highscores – {map}",
  "scores.empty": "No scores yet. Be the first!",
  "scores.offline": "Offline – showing local scores",
  "scores.name": "Name",
  "scores.score": "Score",
  "scores.wave": "Wave",
  "scores.loading": "Loading scores…",

  "pause.title": "Paused",
  "pause.resume": "Resume",
  "pause.quit": "Quit to menu"
}
```

- [ ] **Step 4: Implement i18n.js**

`client/src/i18n/i18n.js`:
```js
const LANGUAGES = {
  en: () => import('./en.json'),
};

let strings = {};
let language = null;

export async function loadLanguage(lang = 'en') {
  const loader = LANGUAGES[lang];
  if (!loader) throw new Error(`unknown language: ${lang}`);
  const mod = await loader();
  strings = mod.default ?? mod;
  language = lang;
  return strings;
}

export function currentLanguage() {
  return language;
}

/** Looks up a string and replaces {placeholders}. Unknown keys return the key. */
export function t(key, params = {}) {
  let s = strings[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/i18n`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/i18n && git commit -m "feat(i18n): add english strings and t() helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Highscore server

**Files:**
- Create: `server/db.js`, `server/app.js`
- Modify: `server/index.js` (replace placeholder)
- Test: `server/app.test.js`

**Interfaces:**
- Produces: `openDb(dbPath) → { insert({name,map,score,wave}) → {id, rank}, top(map, limit) → rows[], close() }`; `createApp({ db, staticDir?, rateLimit? }) → express app`; `MAP_IDS`.
- HTTP: `GET /api/health → {ok:true}`; `GET /api/highscores?map=&limit= → [{name,score,wave,created_at}]`; `POST /api/highscores → 201 {ok:true, rank}`; errors `400 {error}`, `429 {error}`.

- [ ] **Step 1: Write the failing tests**

`server/app.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.js';
import { createApp } from './app.js';

let db;
let app;
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'troll-towers-'));
  db = openDb(path.join(dir, 'test.db'));
  app = createApp({ db, rateLimit: { max: 5, windowMs: 60_000 } });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/highscores', () => {
  it('stores a score and returns its rank', async () => {
    const a = await request(app).post('/api/highscores').send({ name: 'Anna', map: 'green', score: 500, wave: 12 });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ ok: true, rank: 1 });
    const b = await request(app).post('/api/highscores').send({ name: 'Bo', map: 'green', score: 900, wave: 20 });
    expect(b.body.rank).toBe(1);
    const c = await request(app).post('/api/highscores').send({ name: 'Cy', map: 'green', score: 700, wave: 15 });
    expect(c.body.rank).toBe(2);
  });

  it('rejects bad names, maps and scores', async () => {
    const bad = [
      { name: '', map: 'green', score: 1, wave: 1 },
      { name: 'x'.repeat(17), map: 'green', score: 1, wave: 1 },
      { name: 'ok', map: 'moon', score: 1, wave: 1 },
      { name: 'ok', map: 'green', score: -1, wave: 1 },
      { name: 'ok', map: 'green', score: 1.5, wave: 1 },
      { name: 'ok', map: 'green', score: 1, wave: 'a' },
    ];
    for (const body of bad) {
      const res = await request(app).post('/api/highscores').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
  });

  it('trims names', async () => {
    await request(app).post('/api/highscores').send({ name: '  Dee  ', map: 'snow', score: 10, wave: 1 });
    const res = await request(app).get('/api/highscores?map=snow');
    expect(res.body[0].name).toBe('Dee');
  });

  it('rate limits after 5 posts per minute', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/highscores').send({ name: 'Spam', map: 'green', score: i, wave: 1 });
      expect(res.status).toBe(201);
    }
    const res = await request(app).post('/api/highscores').send({ name: 'Spam', map: 'green', score: 99, wave: 1 });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/highscores', () => {
  it('returns scores for a map ordered by score desc, with limit clamped', async () => {
    for (let i = 1; i <= 4; i++) {
      await request(app).post('/api/highscores').send({ name: `P${i}`, map: 'desert', score: i * 100, wave: i });
    }
    await request(app).post('/api/highscores').send({ name: 'Other', map: 'water', score: 5000, wave: 3 });
    const res = await request(app).get('/api/highscores?map=desert&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['P4', 'P3']);
    expect(res.body[0]).toMatchObject({ score: 400, wave: 4 });
    expect(typeof res.body[0].created_at).toBe('string');

    const all = await request(app).get('/api/highscores?map=desert&limit=999');
    expect(all.body).toHaveLength(4);
    const one = await request(app).get('/api/highscores?map=desert&limit=0');
    expect(one.body).toHaveLength(1);
    const dflt = await request(app).get('/api/highscores?map=desert&limit=abc');
    expect(dflt.body).toHaveLength(4);
  });

  it('rejects unknown maps', async () => {
    const res = await request(app).get('/api/highscores?map=mars');
    expect(res.status).toBe(400);
  });
});

describe('static hosting', () => {
  it('serves index.html for non-api routes when a static dir is given', async () => {
    const staticDir = path.join(dir, 'dist');
    fs.mkdirSync(staticDir);
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<h1>hi</h1>');
    const served = createApp({ db, staticDir });
    const root = await request(served).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('hi');
    const deep = await request(served).get('/some/route');
    expect(deep.status).toBe(200);
    expect(deep.text).toContain('hi');
    const api = await request(served).get('/api/nothing');
    expect(api.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run server`
Expected: FAIL, cannot find `./db.js`.

- [ ] **Step 3: Implement db.js**

`server/db.js`:
```js
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/** Opens (and migrates) the SQLite highscore database. */
export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS highscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      map TEXT NOT NULL,
      score INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_highscores_map_score ON highscores (map, score DESC);
  `);

  const insertStmt = db.prepare('INSERT INTO highscores (name, map, score, wave) VALUES (?, ?, ?, ?)');
  const topStmt = db.prepare(
    'SELECT name, score, wave, created_at FROM highscores WHERE map = ? ORDER BY score DESC, id ASC LIMIT ?',
  );
  const rankStmt = db.prepare('SELECT COUNT(*) AS n FROM highscores WHERE map = ? AND score > ?');

  return {
    insert({ name, map, score, wave }) {
      const result = insertStmt.run(name, map, score, wave);
      const better = rankStmt.get(map, score).n;
      return { id: Number(result.lastInsertRowid), rank: better + 1 };
    },
    top(map, limit) {
      return topStmt.all(map, limit);
    },
    close() {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Implement app.js**

`server/app.js`:
```js
import express from 'express';
import path from 'node:path';

export const MAP_IDS = ['green', 'snow', 'desert', 'water'];
const NAME_MAX = 16;

/**
 * Builds the Express app.
 * @param {{db: ReturnType<import('./db.js').openDb>, staticDir?: string, rateLimit?: {max:number, windowMs:number}}} opts
 */
export function createApp({ db, staticDir = null, rateLimit = { max: 5, windowMs: 60_000 } }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2kb' }));

  const hits = new Map(); // ip -> timestamps
  function isLimited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) {
      hits.set(ip, recent);
      return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
  }

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/highscores', (req, res) => {
    const map = String(req.query.map ?? '');
    if (!MAP_IDS.includes(map)) return res.status(400).json({ error: 'unknown map' });
    let limit = Number.parseInt(String(req.query.limit ?? '10'), 10);
    if (!Number.isFinite(limit)) limit = 10;
    limit = Math.min(50, Math.max(1, limit));
    res.json(db.top(map, limit));
  });

  app.post('/api/highscores', (req, res) => {
    if (isLimited(req.ip)) return res.status(429).json({ error: 'too many requests' });
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) return res.status(400).json({ error: 'invalid name' });
    if (!MAP_IDS.includes(body.map)) return res.status(400).json({ error: 'unknown map' });
    const { score, wave } = body;
    if (!Number.isInteger(score) || score < 0 || !Number.isInteger(wave) || wave < 0) {
      return res.status(400).json({ error: 'invalid score' });
    }
    const { rank } = db.insert({ name, map: body.map, score, wave });
    res.status(201).json({ ok: true, rank });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}
```

- [ ] **Step 5: Implement index.js**

`server/index.js`:
```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? path.join(here, 'data', 'highscores.db');
const STATIC_DIR = path.join(here, '..', 'client', 'dist');

const db = openDb(DB_PATH);
const app = createApp({ db, staticDir: STATIC_DIR });

const server = app.listen(PORT, () => {
  console.log(`Troll Towers server listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run server`
Expected: 8 passed.

- [ ] **Step 7: Smoke-test the real server**

Run:
```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && (PORT=3999 node server/index.js & echo $! > /tmp/tt-server.pid; sleep 1; curl -s localhost:3999/api/health; echo; curl -s -X POST localhost:3999/api/highscores -H 'content-type: application/json' -d '{"name":"Smoke","map":"green","score":123,"wave":4}'; echo; curl -s 'localhost:3999/api/highscores?map=green'; echo; kill $(cat /tmp/tt-server.pid))
```
Expected: `{"ok":true}`, then `{"ok":true,"rank":1}`, then a JSON array with one entry named Smoke. Then delete the smoke data: `rm -f server/data/highscores.db*`.

- [ ] **Step 8: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add server && git commit -m "feat(server): add express highscore API backed by sqlite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Rendering and UI tasks

Tasks 14–18 build the Three.js and DOM layers. These are not unit-tested (they need WebGL); each task is verified by `npm run build` succeeding and by a browser check via `npm run dev`. Keep all simulation logic in `game/` where it is tested.

### Task 14: Scene core, camera rig, placeholders and model library

**Files:**
- Create: `client/src/render/SceneManager.js`, `client/src/render/CameraRig.js`, `client/src/render/placeholders.js`, `client/src/render/ModelLibrary.js`

**Interfaces:**
- Produces: `TILE_TOP = 0.12` (y of the top of a buildable tile; towers and decor stand at this height; roads are at y = 0).
- `class SceneManager(canvas)` with `renderer, scene, camera, canvas, sun`, `setTheme({sky, fog})`, `focusSun(cx, cz)`, `resize()`, `start()`, `stop()`, `onFrame(dt)` callback property, `dispose()`. Throws if WebGL is unavailable.
- `class CameraRig(camera, domElement, { centerX, centerZ, extent })` with `update()`, `dispose()`.
- `buildPlaceholder(name) → THREE.Group` (root named `name`; towers contain `Turret`/`Muzzle`, spike tower contains meshes named `Spike`, bats contain `WingL`/`WingR`).
- `MODEL_NAMES` list; `class ModelLibrary({ basePath='/models/' })` with `preload(names)`, `load(name)`, `get(name) → entry`, `instantiate(name) → { root, turret, muzzle, clips, source }`.

- [ ] **Step 1: Write SceneManager.js**

`client/src/render/SceneManager.js`:
```js
import * as THREE from 'three';

export const TILE_TOP = 0.12;

/** Owns the renderer, scene, camera, lights and the animation loop. */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.clock = new THREE.Clock(false);
    this.onFrame = null;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 0.9);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(20, 35, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setTheme({ sky, fog }) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(fog), 45, 110);
  }

  focusSun(cx, cz) {
    this.sun.position.set(cx + 20, 35, cz + 15);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    this.clock.stop();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Write CameraRig.js**

`client/src/render/CameraRig.js`:
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Orbit camera locked to the map centre: rotate 360°, zoom 10–45, tilt 25°–70° above the ground. */
export class CameraRig {
  constructor(camera, domElement, { centerX, centerZ, extent }) {
    this.controls = new OrbitControls(camera, domElement);
    const c = this.controls;
    c.target.set(centerX, 0, centerZ);
    c.enablePan = false;
    c.minDistance = 10;
    c.maxDistance = 45;
    // OrbitControls measures the polar angle from straight up, so 25°–70° elevation is 20°–65° polar.
    c.minPolarAngle = THREE.MathUtils.degToRad(20);
    c.maxPolarAngle = THREE.MathUtils.degToRad(65);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 0.8;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    camera.position.set(centerX, extent * 1.3, centerZ + extent * 1.25);
    c.update();
  }

  update() {
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
```

- [ ] **Step 3: Write placeholders.js**

`client/src/render/placeholders.js`:
```js
import * as THREE from 'three';

const C = {
  wood: 0x8b5a2b,
  woodDark: 0x5e3a18,
  stone: 0x9a9a9a,
  stoneDark: 0x6e6e6e,
  metal: 0x4a4a55,
  ice: 0x9fdcff,
  iceDark: 0x5fb6ee,
  troll: 0x6fbf4a,
  brute: 0x8a7a45,
  bat: 0x6a5acd,
  boss: 0xb0413e,
  skin: 0xa4e07a,
  red: 0xe0453a,
  gold: 0xffd23f,
  leaf: 0x3f9b3f,
  trunk: 0x7a4b23,
  rock: 0x9a9a9a,
  cactus: 0x4f9f4f,
  reed: 0x6e8f3a,
  eye: 0xffffff,
  pupil: 0x111111,
};

function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, ...extra });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, name = '' } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

/** A small troll that "operates" a tower. Kept tiny so the tower stays the focus. */
function operator({ x = 0, y = 0, z = 0, scale = 0.32 } = {}) {
  const g = troll({ height: 1, color: C.troll });
  g.scale.setScalar(scale);
  g.position.set(x, y, z);
  g.name = 'Operator';
  return g;
}

/** Generic cartoon troll: capsule body, round head, big ears, two eyes. */
function troll({ height, color, bulk = 1, wings = false, crown = false, hover = 0 }) {
  const g = new THREE.Group();
  const skin = toon(color);
  const r = 0.26 * height * bulk;
  const bodyLen = 0.32 * height;
  const bodyY = hover + r + bodyLen / 2;
  g.add(mesh(new THREE.CapsuleGeometry(r, bodyLen, 4, 10), skin, { y: bodyY, name: 'Body' }));

  const headR = 0.22 * height;
  const headY = bodyY + bodyLen / 2 + r * 0.6 + headR * 0.7;
  const head = mesh(new THREE.SphereGeometry(headR, 14, 12), skin, { y: headY, name: 'Head' });
  g.add(head);

  const eyeGeo = new THREE.SphereGeometry(headR * 0.22, 8, 8);
  const pupilGeo = new THREE.SphereGeometry(headR * 0.1, 6, 6);
  for (const side of [-1, 1]) {
    g.add(mesh(eyeGeo, toon(C.eye), { x: side * headR * 0.4, y: headY + headR * 0.15, z: headR * 0.8 }));
    g.add(mesh(pupilGeo, toon(C.pupil), { x: side * headR * 0.4, y: headY + headR * 0.15, z: headR * 0.98 }));
    const ear = mesh(new THREE.ConeGeometry(headR * 0.35, headR * 0.9, 6), toon(C.skin), {
      x: side * headR * 1.1,
      y: headY + headR * 0.4,
      rz: side * -1.1,
      name: side < 0 ? 'EarL' : 'EarR',
    });
    g.add(ear);
  }
  g.add(mesh(new THREE.SphereGeometry(headR * 0.28, 8, 8), toon(C.red), { y: headY - headR * 0.15, z: headR * 0.95, name: 'Nose' }));

  const footGeo = new THREE.SphereGeometry(r * 0.45, 8, 6);
  for (const side of [-1, 1]) {
    g.add(mesh(footGeo, toon(C.woodDark), { x: side * r * 0.55, y: hover + r * 0.25, z: r * 0.2, name: side < 0 ? 'FootL' : 'FootR' }));
  }

  if (wings) {
    const wingGeo = new THREE.BoxGeometry(0.6 * height, 0.05, 0.35 * height);
    for (const side of [-1, 1]) {
      const w = mesh(wingGeo, toon(0x2f2f3f), { x: side * (r + 0.28 * height), y: bodyY + r * 0.5, name: side < 0 ? 'WingL' : 'WingR' });
      g.add(w);
    }
  }

  if (crown) {
    const crownY = headY + headR * 0.95;
    g.add(mesh(new THREE.CylinderGeometry(headR * 0.62, headR * 0.55, headR * 0.35, 8), toon(C.gold), { y: crownY, name: 'Crown' }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(headR * 0.12, headR * 0.35, 4), toon(C.gold), {
        x: Math.cos(a) * headR * 0.5,
        y: crownY + headR * 0.3,
        z: Math.sin(a) * headR * 0.5,
      }));
    }
  }
  return g;
}

const BUILDERS = {
  tower_crossbow() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.2, 12), toon(C.stone), { y: 0.6 }));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12), toon(C.stoneDark), { y: 1.2 }));
    const turret = new THREE.Group();
    turret.name = 'Turret';
    turret.position.y = 1.3;
    turret.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 1.0), toon(C.wood), { z: 0.1 }));
    turret.add(mesh(new THREE.BoxGeometry(1.3, 0.1, 0.14), toon(C.woodDark), { z: 0.55 }));
    turret.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.9), toon(C.metal), { y: 0.08, z: 0.2 }));
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    muzzle.position.set(0, 0.05, 0.7);
    turret.add(muzzle);
    turret.add(operator({ z: -0.45, y: -0.1 }));
    g.add(turret);
    return g;
  },

  tower_spike() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.5, 14), toon(C.stone), { y: 0.25 }));
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.55, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(spikeGeo, toon(C.metal), { x: Math.cos(a) * 0.6, y: 0.55, z: Math.sin(a) * 0.6, name: 'Spike' }));
    }
    g.add(operator({ y: 0.5, scale: 0.3 }));
    return g;
  },

  tower_cannon() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), toon(C.wood), { y: 0.35 }));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), toon(C.woodDark), { y: 0.72 }));
    const turret = new THREE.Group();
    turret.name = 'Turret';
    turret.position.y = 1.05;
    turret.add(mesh(new THREE.SphereGeometry(0.38, 12, 10), toon(C.metal), { z: -0.25 }));
    turret.add(mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.2, 14), toon(C.metal), { z: 0.35, rx: Math.PI / 2 }));
    turret.add(mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), toon(C.gold), { z: 0.92 }));
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    muzzle.position.set(0, 0, 1.0);
    turret.add(muzzle);
    turret.add(operator({ x: 0.5, y: -0.25, z: -0.4, scale: 0.28 }));
    g.add(turret);
    return g;
  },

  tower_frozen() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 18), toon(C.ice, { transparent: true, opacity: 0.6 }), { y: 0.03, name: 'Puddle' }));
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), toon(C.ice, { transparent: true, opacity: 0.8 }), { y: 0.7 }));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toon(C.iceDark), { y: 0.7, ry: 0.5 }));
    g.add(mesh(new THREE.ConeGeometry(0.12, 0.35, 6), toon(C.ice), { x: 0.3, y: 0.05, z: 0.5, rx: Math.PI }));
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 6), toon(C.ice), { x: -0.4, y: 0.05, z: -0.3, rx: Math.PI }));
    const op = operator({ y: 1.35, scale: 0.3 });
    op.rotation.z = 0.12;
    g.add(op);
    return g;
  },

  troll_scout: () => troll({ height: 1.0, color: C.troll }),
  troll_brute: () => troll({ height: 1.8, color: C.brute, bulk: 1.35 }),
  troll_bat: () => troll({ height: 0.8, color: C.bat, wings: true, hover: 1.2 }),
  troll_boss: () => troll({ height: 3.0, color: C.boss, bulk: 1.25, crown: true }),

  decor_tree() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.8, 8), toon(C.trunk), { y: 0.4 }));
    g.add(mesh(new THREE.SphereGeometry(0.62, 10, 8), toon(C.leaf), { y: 1.15 }));
    g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), toon(0x4fb04f), { y: 1.6, x: 0.15 }));
    return g;
  },

  decor_rock() {
    const g = new THREE.Group();
    const r = mesh(new THREE.DodecahedronGeometry(0.5, 0), toon(C.rock), { y: 0.3 });
    r.scale.set(1.2, 0.7, 1);
    g.add(r);
    g.add(mesh(new THREE.DodecahedronGeometry(0.25, 0), toon(0x808080), { x: 0.55, y: 0.15, z: 0.3 }));
    return g;
  },

  decor_cactus() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.4, 10), toon(C.cactus), { y: 0.7 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 8), toon(C.cactus), { x: 0.36, y: 0.95, rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 8), toon(C.cactus), { x: 0.55, y: 1.2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 8), toon(C.cactus), { x: -0.3, y: 0.75, rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 8), toon(C.cactus), { x: -0.5, y: 0.95 }));
    return g;
  },

  decor_reed() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6);
    for (const [x, z, h] of [[0, 0, 1.2], [0.25, 0.1, 1.0], [-0.2, 0.2, 0.9], [0.1, -0.25, 1.1]]) {
      const r = mesh(geo, toon(C.reed), { x, y: h / 2, z });
      r.scale.y = h / 1.2;
      g.add(r);
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6), toon(C.woodDark), { x, y: h + 0.05, z }));
    }
    return g;
  },

  base_castle() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), toon(C.stone), { y: 0.5 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.5, 10), toon(C.stoneDark), { x: sx * 0.7, y: 0.75, z: sz * 0.7 }));
        g.add(mesh(new THREE.ConeGeometry(0.3, 0.4, 10), toon(C.red), { x: sx * 0.7, y: 1.7, z: sz * 0.7 }));
      }
    }
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), toon(C.metal), { y: 1.6 }));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.03), toon(C.gold), { x: 0.3, y: 2.0, name: 'Flag' }));
    return g;
  },

  spawn_gate() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.7, 8), toon(C.woodDark), { x: sx * 0.75, y: 0.85 }));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.28, 0.3), toon(C.wood), { y: 1.75 }));
    g.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(0xdddddd), { y: 2.05 }));
    return g;
  },
};

function fallbackCube() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 1, 1), toon(0xff00ff), { y: 0.5 }));
  return g;
}

/** Builds a procedural stand-in for a model that has no .glb yet. */
export function buildPlaceholder(name) {
  const builder = BUILDERS[name];
  const group = builder ? builder() : fallbackCube();
  group.name = name;
  return group;
}
```

- [ ] **Step 4: Write ModelLibrary.js**

`client/src/render/ModelLibrary.js`:
```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneWithSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { buildPlaceholder } from './placeholders.js';

export const MODEL_NAMES = [
  'tower_crossbow', 'tower_spike', 'tower_cannon', 'tower_frozen',
  'troll_scout', 'troll_brute', 'troll_bat', 'troll_boss',
  'decor_tree', 'decor_rock', 'decor_cactus', 'decor_reed',
  'base_castle', 'spawn_gate',
];

function prepareGltfScene(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    o.material = new THREE.MeshToonMaterial({
      color: old?.color ? old.color.clone() : new THREE.Color(0xffffff),
      map: old?.map ?? null,
      vertexColors: !!old?.vertexColors,
      transparent: !!old?.transparent,
      opacity: old?.opacity ?? 1,
    });
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return scene;
}

/**
 * Loads .glb files from /models and falls back to procedural placeholders.
 * Call preload() once, then instantiate() synchronously as often as needed.
 */
export class ModelLibrary {
  constructor({ basePath = '/models/' } = {}) {
    this.basePath = basePath;
    this.loader = new GLTFLoader();
    this.entries = new Map();
    this.pending = new Map();
  }

  async preload(names = MODEL_NAMES) {
    await Promise.all(names.map((n) => this.load(n)));
  }

  load(name) {
    if (this.entries.has(name)) return Promise.resolve(this.entries.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const url = `${this.basePath}${name}.glb`;
    const promise = fetch(url, { method: 'HEAD' })
      .then((res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html')) throw new Error(`no file at ${url}`);
        return this.loader.loadAsync(url);
      })
      .then((gltf) => ({ name, template: prepareGltfScene(gltf.scene), clips: gltf.animations ?? [], source: 'glb' }))
      .catch((err) => {
        console.warn(`[models] ${name}: using placeholder (${err?.message ?? err})`);
        return { name, template: buildPlaceholder(name), clips: [], source: 'placeholder' };
      })
      .then((entry) => {
        this.entries.set(name, entry);
        this.pending.delete(name);
        return entry;
      });
    this.pending.set(name, promise);
    return promise;
  }

  get(name) {
    let entry = this.entries.get(name);
    if (!entry) {
      entry = { name, template: buildPlaceholder(name), clips: [], source: 'placeholder' };
      this.entries.set(name, entry);
    }
    return entry;
  }

  /** Fresh copy of a model. Materials are shared; clone them yourself if you tint per instance. */
  instantiate(name) {
    const entry = this.get(name);
    const root = cloneWithSkeleton(entry.template);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return {
      root,
      turret: root.getObjectByName('Turret') ?? root,
      muzzle: root.getObjectByName('Muzzle') ?? null,
      clips: entry.clips,
      source: entry.source,
    };
  }
}
```

- [ ] **Step 5: Verify the build resolves the imports**

Temporarily make `client/src/main.js` import the modules so Vite bundles them:
```js
import { SceneManager } from './render/SceneManager.js';
import { CameraRig } from './render/CameraRig.js';
import { ModelLibrary } from './render/ModelLibrary.js';
console.log('Troll Towers booting', { SceneManager, CameraRig, ModelLibrary });
```
Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run build`
Expected: `✓ built`, no "could not resolve" errors. (Task 15 replaces main.js again.)

- [ ] **Step 6: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/render client/src/main.js && git commit -m "feat(render): add scene manager, camera rig, placeholders and model library

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Map renderer and first visible scene

**Files:**
- Create: `client/src/render/MapRenderer.js`
- Modify: `client/src/main.js` (replace)

**Interfaces:**
- Produces: `THEMES` (per theme: `sky, fog, ground[2], road, water, decor[]`); `class MapRenderer({ scene, map, grid, models })` with `theme, centerX, centerZ, extent, group`, `setFrozen(tiles)`, `update(dt)`, `pickTile(raycaster) → {x,y,type}|null`, `dispose()`.

- [ ] **Step 1: Write MapRenderer.js**

`client/src/render/MapRenderer.js`:
```js
import * as THREE from 'three';
import { TILE_SIZE, TILE } from '../game/Grid.js';
import { TILE_TOP } from './SceneManager.js';

export const THEMES = {
  green: { sky: '#9ad7ff', fog: '#bfe6ff', ground: ['#6fbf4a', '#63b03f'], road: '#c9a36b', water: '#3f8fd8', decor: ['decor_tree', 'decor_rock'] },
  snow: { sky: '#dbe9ff', fog: '#e8f0ff', ground: ['#eef4ff', '#dfe8f7'], road: '#b9c4d4', water: '#7fb3e6', decor: ['decor_tree', 'decor_rock'] },
  desert: { sky: '#ffd9a0', fog: '#ffe6bf', ground: ['#e8c878', '#dcb964'], road: '#b58a4e', water: '#4aa3d8', decor: ['decor_cactus', 'decor_rock'] },
  water: { sky: '#8fd0d8', fog: '#bfe7ea', ground: ['#5da85a', '#4f9a4f'], road: '#8f7a55', water: '#2f7fc6', decor: ['decor_reed', 'decor_tree'] },
};

const TILE_THICKNESS = 0.5;

/** Deterministic pseudo random so decor placement is stable per map. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Draws the tiles, decor, base, spawn gates and frozen overlays for one map. */
export class MapRenderer {
  constructor({ scene, map, grid, models }) {
    this.scene = scene;
    this.map = map;
    this.grid = grid;
    this.models = models;
    this.theme = THEMES[map.theme] ?? THEMES.green;
    this.group = new THREE.Group();
    this.group.name = 'map';
    this.frozenGroup = new THREE.Group();
    this.groundMeshes = [];
    this.time = 0;
    this.frozenMaterial = new THREE.MeshToonMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false });
    this.frozenGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.96, TILE_SIZE * 0.96);

    this.#buildTiles();
    this.#buildDecor();
    this.#buildLandmarks();
    this.group.add(this.frozenGroup);
    scene.add(this.group);
  }

  get centerX() {
    return (this.map.width * TILE_SIZE) / 2;
  }

  get centerZ() {
    return (this.map.height * TILE_SIZE) / 2;
  }

  get extent() {
    return (Math.max(this.map.width, this.map.height) * TILE_SIZE) / 2;
  }

  #buildTiles() {
    const { width, height, tiles } = this.map;
    const box = new THREE.BoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE);
    const mats = {
      g0: new THREE.MeshToonMaterial({ color: this.theme.ground[0] }),
      g1: new THREE.MeshToonMaterial({ color: this.theme.ground[1] }),
      road: new THREE.MeshToonMaterial({ color: this.theme.road }),
      water: new THREE.MeshToonMaterial({ color: this.theme.water, transparent: true, opacity: 0.9 }),
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = tiles[y][x];
        let mat;
        let top;
        if (type === TILE.ROAD) {
          mat = mats.road;
          top = 0;
        } else if (type === TILE.WATER) {
          mat = mats.water;
          top = -0.2;
        } else {
          mat = (x + y) % 2 ? mats.g0 : mats.g1;
          top = TILE_TOP;
        }
        const m = new THREE.Mesh(box, mat);
        m.position.set((x + 0.5) * TILE_SIZE, top - TILE_THICKNESS / 2, (y + 0.5) * TILE_SIZE);
        m.receiveShadow = true;
        m.castShadow = type !== TILE.WATER;
        m.userData.tile = { x, y, type };
        this.group.add(m);
        this.groundMeshes.push(m);
      }
    }
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(width * TILE_SIZE + 1.5, 1.6, height * TILE_SIZE + 1.5),
      new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.ground[1]).multiplyScalar(0.55) }),
    );
    slab.position.set(this.centerX, -TILE_THICKNESS - 0.8, this.centerZ);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  #buildDecor() {
    const rng = makeRng(hashString(this.map.id));
    const { width, height, tiles } = this.map;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] !== TILE.DECOR) continue;
        const name = this.theme.decor[Math.floor(rng() * this.theme.decor.length)];
        const { root } = this.models.instantiate(name);
        const w = this.grid.tileToWorld(x, y);
        root.position.set(w.x + (rng() - 0.5) * 0.4, TILE_TOP, w.z + (rng() - 0.5) * 0.4);
        root.rotation.y = rng() * Math.PI * 2;
        root.scale.setScalar(0.9 + rng() * 0.3);
        this.group.add(root);
      }
    }
  }

  #buildLandmarks() {
    const [bx, by] = this.map.base;
    const base = this.models.instantiate('base_castle').root;
    const bw = this.grid.tileToWorld(bx, by);
    base.position.set(bw.x, 0, bw.z);
    this.group.add(base);

    for (const path of this.map.paths) {
      const [sx, sy] = path[0];
      const [nx, ny] = path[1];
      const gate = this.models.instantiate('spawn_gate').root;
      const gw = this.grid.tileToWorld(sx, sy);
      gate.position.set(gw.x, 0, gw.z);
      gate.rotation.y = Math.atan2(nx - sx, ny - sy);
      this.group.add(gate);
    }
  }

  /** Replaces the frozen overlays with one plane per frozen road tile. */
  setFrozen(tiles) {
    for (const child of [...this.frozenGroup.children]) this.frozenGroup.remove(child);
    for (const { x, y, multiplier } of tiles) {
      const plane = new THREE.Mesh(this.frozenGeometry, this.frozenMaterial);
      plane.rotation.x = -Math.PI / 2;
      const w = this.grid.tileToWorld(x, y);
      plane.position.set(w.x, 0.02, w.z);
      plane.userData.multiplier = multiplier;
      this.frozenGroup.add(plane);
    }
  }

  update(dt) {
    this.time += dt;
    this.frozenMaterial.opacity = 0.45 + 0.15 * Math.sin(this.time * 2.5);
    for (const [i, plane] of this.frozenGroup.children.entries()) {
      plane.position.y = 0.02 + 0.015 * Math.sin(this.time * 3 + i);
    }
  }

  pickTile(raycaster) {
    const hits = raycaster.intersectObjects(this.groundMeshes, false);
    return hits.length ? hits[0].object.userData.tile : null;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
    this.frozenGeometry.dispose();
    this.frozenMaterial.dispose();
  }
}
```

- [ ] **Step 2: Replace main.js with a map viewer bootstrap**

`client/src/main.js`:
```js
import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { CameraRig } from './render/CameraRig.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { MapRenderer } from './render/MapRenderer.js';
import { Grid } from './game/Grid.js';
import { MAPS } from './data/index.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  await loadLanguage('en');
  const canvas = document.getElementById('game');
  let sceneManager;
  try {
    sceneManager = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    showFatal(t('app.webglMissing'));
    return;
  }

  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);

  const mapId = new URLSearchParams(location.search).get('map') ?? 'green';
  const map = MAPS[mapId] ?? MAPS.green;
  const grid = new Grid(map);
  const mapRenderer = new MapRenderer({ scene: sceneManager.scene, map, grid, models });
  sceneManager.setTheme(mapRenderer.theme);
  sceneManager.focusSun(mapRenderer.centerX, mapRenderer.centerZ);
  const rig = new CameraRig(sceneManager.camera, canvas, {
    centerX: mapRenderer.centerX,
    centerZ: mapRenderer.centerZ,
    extent: mapRenderer.extent,
  });
  mapRenderer.setFrozen([{ x: map.paths[0][1][0], y: map.paths[0][1][1], multiplier: 0.5 }]);

  sceneManager.onFrame = (dt) => {
    mapRenderer.update(dt);
    rig.update();
  };
  sceneManager.start();
}

boot();
```

- [ ] **Step 3: Verify in the browser**

Run `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run dev -w client` (or use the Browser pane's `preview_start` with a `.claude/launch.json` entry `{"name":"client","runtimeExecutable":"npm","runtimeArgs":["run","dev","-w","client"],"port":5173}`), then open `http://localhost:5173/?map=green`, `?map=snow`, `?map=desert`, `?map=water`.

Expected for every map: a checkerboard ground with a distinct road, water tiles lower and blue, placeholder trees/rocks/cacti/reeds on `D` tiles, a castle on the base tile, a wooden gate at each spawn, one pulsing light-blue square on the second road waypoint, sky colour per theme. Left-drag rotates, wheel zooms with limits, tilt is clamped. Console shows 14 `[models] … using placeholder` warnings and no errors. Take a screenshot per map.

- [ ] **Step 4: Run the build and commit**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run build`
Expected: `✓ built`.

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/render/MapRenderer.js client/src/main.js .claude/launch.json 2>/dev/null; git add client/src/render/MapRenderer.js client/src/main.js && git commit -m "feat(render): draw maps with themed tiles, decor, landmarks and frozen overlay

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Enemy/tower views, effects and the game session

**Files:**
- Create: `client/src/render/EnemyView.js`, `client/src/render/TowerView.js`, `client/src/render/Effects.js`, `client/src/render/GameSession.js`
- Modify: `client/src/main.js` (replace)

**Interfaces:**
- Consumes: `Game` events (Task 11), `ModelLibrary.instantiate`, `MapRenderer`, `CameraRig`, `TILE_TOP`.
- Produces: `class EnemyView(enemy, models, scene)` with `update(dt) → finished:boolean`, `flash()`, `startDeath()`, `dispose()`, `worldPosition(target)`.
- `class TowerView(tower, models, scene)` with `update(dt)`, `playFire()`, `setLevel(level)`, `muzzleWorldPosition(target)`, `dispose()`; `makeGhost(models, type, def) → { root, ring, setLevelRange(range), setOk(bool) }`.
- `class Effects(scene)` with `spawnProjectile({from, target, kind})`, `hitSprite(position, text, color?)`, `deathBurst(position)`, `update(dt)`, `dispose()`.
- `class GameSession({ game, sceneManager, models })` with `speed`, `update(dt)`, `pickTile(clientX, clientY)`, `showGhost(type, tile)`, `hideGhost()`, `dispose()`.

- [ ] **Step 1: Write EnemyView.js**

`client/src/render/EnemyView.js`:
```js
import * as THREE from 'three';

const DEATH_DURATION = 0.45;

/** Visual for one enemy: model instance, walk bobbing, hp bar, hit flash and death squash. */
export class EnemyView {
  constructor(enemy, models, scene) {
    this.enemy = enemy;
    this.scene = scene;
    const inst = models.instantiate(`troll_${enemy.type}`);
    this.root = inst.root;
    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
    this.wings = [this.root.getObjectByName('WingL'), this.root.getObjectByName('WingR')].filter(Boolean);
    this.height = new THREE.Box3().setFromObject(this.root).max.y;

    // Optional glTF animation clips (see docs/model-contract.md): walk loops, die plays once.
    this.mixer = null;
    this.actions = {};
    if (inst.clips.length) {
      this.mixer = new THREE.AnimationMixer(this.root);
      for (const clip of inst.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.actions.walk?.play();
    }

    this.hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x222222, depthTest: false }));
    this.hpBg.scale.set(1.1, 0.16, 1);
    this.hpBg.position.y = this.height + 0.35;
    this.hpBg.renderOrder = 10;
    this.hpFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x44dd44, depthTest: false }));
    this.hpFg.center.set(0, 0.5);
    this.hpFg.scale.set(1.0, 0.1, 1);
    this.hpFg.position.set(-0.5, this.height + 0.35, 0);
    this.hpFg.renderOrder = 11;
    this.root.add(this.hpBg, this.hpFg);

    this.walkT = Math.random() * 10;
    this.flashT = 0;
    this.dying = false;
    this.deathT = 0;
    this.syncTransform();
    scene.add(this.root);
  }

  syncTransform() {
    this.root.position.set(this.enemy.x, 0, this.enemy.z);
    this.root.rotation.y = this.enemy.heading;
  }

  worldPosition(target = new THREE.Vector3()) {
    return target.set(this.enemy.x, this.height * 0.6, this.enemy.z);
  }

  flash() {
    this.flashT = 0.08;
  }

  startDeath() {
    this.dying = true;
    this.hpBg.visible = false;
    this.hpFg.visible = false;
    if (this.actions.die) {
      this.actions.walk?.stop();
      const die = this.actions.die;
      die.reset();
      die.setLoop(THREE.LoopOnce, 1);
      die.clampWhenFinished = true;
      die.play();
    }
  }

  /** Returns true when a death animation has finished and the view can be removed. */
  update(dt) {
    this.mixer?.update(dt);
    if (this.dying) {
      this.deathT += dt;
      if (this.actions.die) return this.deathT >= this.actions.die.getClip().duration;
      const t = Math.min(1, this.deathT / DEATH_DURATION);
      this.root.rotation.y += dt * 16;
      this.root.scale.set(1 + t * 0.6, Math.max(0.05, 1 - t), 1 + t * 0.6);
      return t >= 1;
    }
    this.syncTransform();
    this.walkT += dt * 9 * this.enemy.speedMultiplier;
    const s = Math.sin(this.walkT);
    if (this.actions.walk) this.actions.walk.timeScale = this.enemy.speedMultiplier;
    else this.root.scale.set(1 - 0.04 * s, 1 + 0.07 * s, 1 - 0.04 * s);
    this.wings.forEach((w, i) => {
      w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.walkT * 2) * 0.6;
    });
    this.hpFg.scale.x = Math.max(0, this.enemy.hp / this.enemy.maxHp);
    this.hpFg.material.color.setHex(this.hpFg.scale.x > 0.5 ? 0x44dd44 : this.hpFg.scale.x > 0.25 ? 0xffb347 : 0xff5544);

    this.flashT = Math.max(0, this.flashT - dt);
    const slowed = this.enemy.speedMultiplier < 1;
    const emissive = this.flashT > 0 ? 0xffffff : slowed ? 0x2266cc : 0x000000;
    for (const m of this.materials) if (m.emissive) m.emissive.setHex(emissive);
    return false;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
    this.hpBg.material.dispose();
    this.hpFg.material.dispose();
  }
}
```

- [ ] **Step 2: Write TowerView.js**

`client/src/render/TowerView.js`:
```js
import * as THREE from 'three';
import { TILE_TOP } from './SceneManager.js';
import { TILE_SIZE } from '../game/Grid.js';

const FIRE_ANIM = 0.25;
const SPIKE_ANIM = 0.4;

function lerpAngle(a, b, t) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/** Visual for one placed tower: turret aiming, squash-and-stretch on fire, spikes, level stars. */
export class TowerView {
  constructor(tower, models, scene) {
    this.tower = tower;
    this.scene = scene;
    const inst = models.instantiate(`tower_${tower.type}`);
    this.root = inst.root;
    this.turret = inst.turret;
    this.muzzle = inst.muzzle;
    this.turretBaseZ = this.turret.position.z;
    this.root.position.set(tower.x, TILE_TOP, tower.z);
    this.spikes = [];
    this.root.traverse((o) => {
      if (o.name === 'Spike') this.spikes.push({ mesh: o, baseY: o.position.y });
    });
    this.animT = 0;
    this.spikeT = 0;
    // Optional glTF clips: idle loops, shoot plays once per shot (replaces the squash).
    this.mixer = null;
    this.actions = {};
    if (inst.clips.length) {
      this.mixer = new THREE.AnimationMixer(this.root);
      for (const clip of inst.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.actions.idle?.play();
    }
    this.stars = new THREE.Group();
    this.root.add(this.stars);
    this.starGeo = new THREE.SphereGeometry(0.11, 8, 6);
    this.starMat = new THREE.MeshToonMaterial({ color: 0xffd23f });
    this.setLevel(tower.level);
    scene.add(this.root);
  }

  setLevel(level) {
    for (const c of [...this.stars.children]) this.stars.remove(c);
    const top = new THREE.Box3().setFromObject(this.root).max.y - TILE_TOP + 0.35;
    for (let i = 0; i < level; i++) {
      const s = new THREE.Mesh(this.starGeo, this.starMat);
      s.position.set((i - (level - 1) / 2) * 0.35, top, 0);
      this.stars.add(s);
    }
  }

  playFire() {
    if (this.actions.shoot) {
      const shoot = this.actions.shoot;
      shoot.reset();
      shoot.setLoop(THREE.LoopOnce, 1);
      shoot.play();
    } else {
      this.animT = FIRE_ANIM;
    }
    if (this.tower.type === 'spike') this.spikeT = SPIKE_ANIM;
  }

  muzzleWorldPosition(target = new THREE.Vector3()) {
    (this.muzzle ?? this.turret).getWorldPosition(target);
    if (!this.muzzle) target.y += 1.2;
    return target;
  }

  update(dt) {
    this.mixer?.update(dt);
    if (this.turret !== this.root) {
      this.turret.rotation.y = lerpAngle(this.turret.rotation.y, this.tower.facing, 1 - Math.exp(-dt * 12));
    }
    if (this.animT > 0) {
      this.animT = Math.max(0, this.animT - dt);
      const t = 1 - this.animT / FIRE_ANIM;
      const s = Math.sin(t * Math.PI);
      this.root.scale.set(1 + 0.12 * s, 1 - 0.18 * s, 1 + 0.12 * s);
      if (this.tower.type === 'cannon') this.turret.position.z = this.turretBaseZ - 0.35 * s;
    } else {
      this.root.scale.set(1, 1, 1);
      if (this.tower.type === 'cannon') this.turret.position.z = this.turretBaseZ;
    }
    if (this.spikeT > 0) {
      this.spikeT = Math.max(0, this.spikeT - dt);
      const t = 1 - this.spikeT / SPIKE_ANIM;
      const lift = Math.sin(t * Math.PI) * 0.45;
      for (const s of this.spikes) s.mesh.position.y = s.baseY + lift;
    }
    this.stars.rotation.y += dt * 1.5;
  }

  dispose() {
    this.scene.remove(this.root);
    this.starGeo.dispose();
    this.starMat.dispose();
  }
}

/** Translucent preview of a tower plus its range ring. */
export function makeGhost(models, type, def) {
  const { root } = models.instantiate(`tower_${type}`);
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.5;
      o.castShadow = false;
    }
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.1, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);
  const level0 = def.levels[0];
  const range = def.kind === 'freeze' ? (level0.freezeRadius + 0.5) * TILE_SIZE : level0.range;
  ring.scale.setScalar(range);
  return {
    root,
    ring,
    setOk(ok) {
      ringMat.color.setHex(ok ? 0x66ff66 : 0xff5555);
      root.traverse((o) => {
        if (o.isMesh && o !== ring) o.material.color.setHex(ok ? 0xffffff : 0xff8888);
      });
    },
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
      ring.geometry.dispose();
    },
  };
}
```

- [ ] **Step 3: Write Effects.js**

`client/src/render/Effects.js`:
```js
import * as THREE from 'three';

const FONT = 'bold 64px "Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';

/** Projectiles, comic hit sprites and death bursts. Purely cosmetic; damage is applied by Game. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.textures = new Map();
    this.arrowGeo = new THREE.ConeGeometry(0.09, 0.7, 6);
    this.arrowMat = new THREE.MeshToonMaterial({ color: 0x5a3a1a });
    this.shellGeo = new THREE.SphereGeometry(0.24, 10, 8);
    this.shellMat = new THREE.MeshToonMaterial({ color: 0x333333 });
    this.tmp = new THREE.Vector3();
  }

  #texture(text, color) {
    const key = `${text}|${color}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2b1d0e';
    ctx.strokeText(text, 128, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  #targetPoint(target, out) {
    const y = target.flying ? 1.6 : 0.6;
    return out.set(target.x, y, target.z);
  }

  spawnProjectile({ from, target, kind }) {
    const mesh = kind === 'shell' ? new THREE.Mesh(this.shellGeo, this.shellMat) : new THREE.Mesh(this.arrowGeo, this.arrowMat);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.items.push({ type: 'projectile', mesh, kind, target, start: from.clone(), t: 0, duration: kind === 'shell' ? 0.55 : 0.16 });
  }

  hitSprite(position, text = 'POW!', color = '#ffd23f') {
    const mat = new THREE.SpriteMaterial({ map: this.#texture(text, color), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 0.4;
    sprite.renderOrder = 20;
    sprite.scale.set(1.6, 0.8, 1);
    this.scene.add(sprite);
    this.items.push({ type: 'pop', sprite, t: 0, duration: 0.45 });
  }

  deathBurst(position) {
    const tex = this.#texture('★', '#ffd23f');
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.position.copy(position);
      sprite.scale.set(0.5, 0.25, 1);
      sprite.renderOrder = 20;
      const a = (i / 6) * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 3, 4 + Math.random() * 2, Math.sin(a) * 3);
      this.scene.add(sprite);
      this.items.push({ type: 'star', sprite, vel, t: 0, duration: 0.7 });
    }
  }

  update(dt) {
    const keep = [];
    for (const item of this.items) {
      item.t += dt;
      const k = Math.min(1, item.t / item.duration);
      if (item.type === 'projectile') {
        const to = this.#targetPoint(item.target, this.tmp);
        item.mesh.position.lerpVectors(item.start, to, k);
        if (item.kind === 'shell') {
          item.mesh.position.y += Math.sin(k * Math.PI) * 2.5;
        } else {
          item.mesh.lookAt(to);
          item.mesh.rotateX(Math.PI / 2);
        }
        if (k >= 1) {
          this.scene.remove(item.mesh);
          this.hitSprite(to, item.kind === 'shell' ? 'BOOM!' : 'POW!', item.kind === 'shell' ? '#ff6b3d' : '#ffd23f');
          continue;
        }
      } else if (item.type === 'pop') {
        item.sprite.scale.set(1.6 * (0.5 + k), 0.8 * (0.5 + k), 1);
        item.sprite.position.y += dt * 0.8;
        item.sprite.material.opacity = 1 - k * k;
        if (k >= 1) {
          this.scene.remove(item.sprite);
          item.sprite.material.dispose();
          continue;
        }
      } else if (item.type === 'star') {
        item.vel.y -= 12 * dt;
        item.sprite.position.addScaledVector(item.vel, dt);
        item.sprite.material.opacity = 1 - k;
        if (k >= 1) {
          this.scene.remove(item.sprite);
          item.sprite.material.dispose();
          continue;
        }
      }
      keep.push(item);
    }
    this.items = keep;
  }

  dispose() {
    for (const item of this.items) this.scene.remove(item.mesh ?? item.sprite);
    this.items = [];
    for (const tex of this.textures.values()) tex.dispose();
    this.arrowGeo.dispose();
    this.arrowMat.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
  }
}
```

- [ ] **Step 4: Write GameSession.js**

`client/src/render/GameSession.js`:
```js
import * as THREE from 'three';
import { MapRenderer } from './MapRenderer.js';
import { CameraRig } from './CameraRig.js';
import { Effects } from './Effects.js';
import { EnemyView } from './EnemyView.js';
import { TowerView, makeGhost } from './TowerView.js';
import { TILE_TOP } from './SceneManager.js';

/** Binds one Game to the Three.js scene: creates views for events and advances everything per frame. */
export class GameSession {
  constructor({ game, sceneManager, models }) {
    this.game = game;
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.models = models;
    this.speed = 1;

    this.mapRenderer = new MapRenderer({ scene: this.scene, map: game.map, grid: game.grid, models });
    sceneManager.setTheme(this.mapRenderer.theme);
    sceneManager.focusSun(this.mapRenderer.centerX, this.mapRenderer.centerZ);
    this.cameraRig = new CameraRig(sceneManager.camera, sceneManager.canvas, {
      centerX: this.mapRenderer.centerX,
      centerZ: this.mapRenderer.centerZ,
      extent: this.mapRenderer.extent,
    });
    this.effects = new Effects(this.scene);
    this.enemyViews = new Map();
    this.towerViews = new Map();
    this.dyingViews = [];
    this.ghost = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tmp = new THREE.Vector3();

    this.unsubscribe = [
      game.on('enemy:spawned', ({ enemy }) => this.enemyViews.set(enemy.id, new EnemyView(enemy, models, this.scene))),
      game.on('enemy:hit', ({ enemy }) => this.enemyViews.get(enemy.id)?.flash()),
      game.on('enemy:died', ({ enemy, gold }) => {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        view.startDeath();
        this.dyingViews.push(view);
        this.effects.deathBurst(view.worldPosition(this.tmp));
        this.effects.hitSprite(view.worldPosition(this.tmp), `+${gold}`, '#ffe680');
      }),
      game.on('enemy:reachedBase', ({ enemy }) => {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        this.effects.hitSprite(view.worldPosition(this.tmp), 'OUCH!', '#ff6b6b');
        view.dispose();
      }),
      game.on('tower:built', ({ tower }) => {
        this.towerViews.set(tower.id, new TowerView(tower, models, this.scene));
        this.hideGhost();
      }),
      game.on('tower:upgraded', ({ tower }) => {
        const view = this.towerViews.get(tower.id);
        view?.setLevel(tower.level);
        this.effects.hitSprite(this.tmp.set(tower.x, TILE_TOP + 2, tower.z), 'LEVEL UP!', '#9be7ff');
      }),
      game.on('tower:sold', ({ tower }) => {
        this.towerViews.get(tower.id)?.dispose();
        this.towerViews.delete(tower.id);
      }),
      game.on('tower:fired', ({ tower, target, projectile }) => {
        const view = this.towerViews.get(tower.id);
        if (!view) return;
        view.playFire();
        if (target) this.effects.spawnProjectile({ from: view.muzzleWorldPosition(new THREE.Vector3()), target, kind: projectile });
      }),
      game.on('tile:frozenChanged', ({ tiles }) => this.mapRenderer.setFrozen(tiles)),
    ];
    this.mapRenderer.setFrozen(game.grid.frozenTiles());
  }

  update(dt) {
    this.game.update(dt * this.speed);
    for (const view of this.enemyViews.values()) view.update(dt * this.speed);
    this.dyingViews = this.dyingViews.filter((view) => {
      const done = view.update(dt * this.speed);
      if (done) view.dispose();
      return !done;
    });
    for (const view of this.towerViews.values()) view.update(dt * this.speed);
    this.effects.update(dt * this.speed);
    this.mapRenderer.update(dt);
    this.cameraRig.update();
  }

  pickTile(clientX, clientY) {
    const rect = this.sceneManager.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    return this.mapRenderer.pickTile(this.raycaster);
  }

  showGhost(type, tile) {
    if (!this.ghost || this.ghost.type !== type) {
      this.hideGhost();
      this.ghost = { type, ...makeGhost(this.models, type, this.game.towerDefs[type]) };
      this.scene.add(this.ghost.root);
    }
    const w = this.game.grid.tileToWorld(tile.x, tile.y);
    this.ghost.root.position.set(w.x, TILE_TOP, w.z);
    const affordable = this.game.economy.canAfford(this.game.towerDefs[type].levels[0].cost);
    this.ghost.setOk(this.game.grid.isBuildable(tile.x, tile.y) && affordable);
  }

  hideGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.root);
    this.ghost.dispose();
    this.ghost = null;
  }

  dispose() {
    for (const off of this.unsubscribe) off();
    this.hideGhost();
    for (const v of this.enemyViews.values()) v.dispose();
    for (const v of this.dyingViews) v.dispose();
    for (const v of this.towerViews.values()) v.dispose();
    this.enemyViews.clear();
    this.towerViews.clear();
    this.dyingViews = [];
    this.effects.dispose();
    this.mapRenderer.dispose();
    this.cameraRig.dispose();
  }
}
```

- [ ] **Step 5: Replace main.js so a game runs with a dev console handle**

`client/src/main.js`:
```js
import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameSession } from './render/GameSession.js';
import { Game } from './game/Game.js';
import { MAPS, TOWER_DEFS, ENEMY_DEFS } from './data/index.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  await loadLanguage('en');
  const canvas = document.getElementById('game');
  let sceneManager;
  try {
    sceneManager = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    showFatal(t('app.webglMissing'));
    return;
  }
  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);

  const mapId = new URLSearchParams(location.search).get('map') ?? 'green';
  const game = new Game({ map: MAPS[mapId] ?? MAPS.green, towerDefs: TOWER_DEFS, enemyDefs: ENEMY_DEFS });
  const session = new GameSession({ game, sceneManager, models });
  sceneManager.onFrame = (dt) => session.update(dt);
  sceneManager.start();
  if (import.meta.env.DEV) window.__tt = { game, session };
}

boot();
```

- [ ] **Step 6: Verify in the browser**

Start the dev server (`npm run dev -w client`), open `http://localhost:5173/?map=green`, and in the browser console run:
```js
__tt.game.buildTower('crossbow', 6, 4); __tt.game.buildTower('cannon', 11, 8); __tt.game.buildTower('spike', 6, 6); __tt.game.buildTower('frozen', 4, 6); __tt.game.startNextWave();
```
Expected: scouts walk out of the gate along the road with bobbing bodies and hp bars; the road tiles around the ice block turn light blue and trolls crossing them glow bluish and slow down; the crossbow turret turns to follow trolls and shoots arrows with a squash; the cannon lobs shells with a recoil and "BOOM!"; spikes pop up when trolls pass; dead trolls spin flat with a star burst and "+5"; the frozen tower's tint is translucent. Run `__tt.game.startNextWave()` a few more times; bats fly higher and are ignored by spikes. No console errors.

- [ ] **Step 7: Build and commit**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run build`
Expected: `✓ built`.

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src/render client/src/main.js && git commit -m "feat(render): add enemy/tower views, cartoon effects and game session binding

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: HUD, build panel and input

**Files:**
- Create: `client/src/ui/InputController.js`, `client/src/ui/Hud.js`, `client/src/ui/BuildPanel.js`, `client/src/ui/GameScreen.js`
- Modify: `client/src/style.css` (replace), `client/src/main.js` (replace)

**Interfaces:**
- Produces: `class InputController(canvas, { pickTile, onTileClick, onTileHover, onCancel })` with `dispose()`.
- `class Hud(rootEl)` with callback props `onNextWave, onAutoToggle, onSpeedToggle, onMenu`, methods `render(game, speed)`, `toast(text)`, `show()`, `hide()`.
- `class BuildPanel(rootEl, { towerDefs, towerOrder })` with callback props `onPreview(type|null), onBuild(type), onUpgrade(), onSell(), onClose()`, methods `showBuild(tile, gold)`, `showTower(tower, gold)`, `refresh(gold)`, `hide()`, getter `visible`.
- `class GameScreen({ mapId, sceneManager, models, onEnd, onQuit })` with `game, session`, `resume()`, `pause()`, `dispose()`.

- [ ] **Step 1: Write InputController.js**

`client/src/ui/InputController.js`:
```js
const DRAG_THRESHOLD_PX = 6;

/** Turns pointer events on the canvas into tile clicks (ignoring drags used for orbiting) and hovers. */
export class InputController {
  constructor(canvas, { pickTile, onTileClick, onTileHover, onCancel }) {
    this.canvas = canvas;
    this.pickTile = pickTile;
    this.onTileClick = onTileClick;
    this.onTileHover = onTileHover;
    this.onCancel = onCancel;
    this.down = null;

    this._onDown = (e) => {
      if (e.button !== 0) return;
      this.down = { x: e.clientX, y: e.clientY };
    };
    this._onUp = (e) => {
      if (e.button !== 0 || !this.down) return;
      const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
      this.down = null;
      if (moved > DRAG_THRESHOLD_PX || e.target !== this.canvas) return;
      this.onTileClick(this.pickTile(e.clientX, e.clientY));
    };
    this._onMove = (e) => {
      if (this.down) return;
      this.onTileHover(this.pickTile(e.clientX, e.clientY));
    };
    this._onKey = (e) => {
      if (e.key === 'Escape') this.onCancel();
    };
    canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('keydown', this._onKey);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    window.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('keydown', this._onKey);
  }
}
```

- [ ] **Step 2: Write Hud.js**

`client/src/ui/Hud.js`:
```js
import { t } from '../i18n/i18n.js';

/** Top bar: gold / score / lives / wave and the wave, auto, speed and menu buttons. */
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-bar">
        <div class="stat"><span class="label">${t('hud.gold')}</span><span class="value" data-ref="gold">0</span></div>
        <div class="stat"><span class="label">${t('hud.score')}</span><span class="value" data-ref="score">0</span></div>
        <div class="stat"><span class="label">${t('hud.lives')}</span><span class="value" data-ref="lives">0</span></div>
        <div class="stat wave" data-ref="wave"></div>
        <button class="btn primary" data-ref="next"></button>
        <button class="btn toggle" data-ref="auto" aria-pressed="false">${t('hud.auto')}</button>
        <button class="btn" data-ref="speed"></button>
        <button class="btn" data-ref="menu">${t('hud.menu')}</button>
      </div>
      <div class="toast" data-ref="toast" hidden></div>`;
    this.refs = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
    this.onNextWave = null;
    this.onAutoToggle = null;
    this.onSpeedToggle = null;
    this.onMenu = null;
    this.refs.next.addEventListener('click', () => this.onNextWave?.());
    this.refs.auto.addEventListener('click', () => this.onAutoToggle?.());
    this.refs.speed.addEventListener('click', () => this.onSpeedToggle?.());
    this.refs.menu.addEventListener('click', () => this.onMenu?.());
    this.last = {};
    this.toastTimer = null;
  }

  #set(ref, text) {
    if (this.last[ref] === text) return;
    this.last[ref] = text;
    this.refs[ref].textContent = text;
  }

  render(game, speed) {
    const { gold, score, lives } = game.economy;
    this.#set('gold', String(gold));
    this.#set('score', String(score));
    this.#set('lives', String(lives));
    const endless = game.endless || game.wave > game.totalWaves;
    this.#set('wave', endless ? t('hud.waveEndless', { wave: game.wave }) : t('hud.wave', { wave: game.wave, total: game.totalWaves }));

    let nextLabel;
    if (game.state === 'running') nextLabel = t('hud.callEarly');
    else if (game.countdown !== null && game.autoWave) nextLabel = t('hud.nextWaveIn', { seconds: Math.ceil(game.countdown) });
    else nextLabel = t('hud.nextWave');
    this.#set('next', nextLabel);
    this.refs.next.disabled = !game.canStartWave;
    this.refs.auto.setAttribute('aria-pressed', String(game.autoWave));
    this.#set('speed', t('hud.speed', { speed }));
  }

  toast(text) {
    const el = this.refs.toast;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
```

- [ ] **Step 3: Write BuildPanel.js**

`client/src/ui/BuildPanel.js`:
```js
import { t } from '../i18n/i18n.js';

const STAT_KEYS = ['damage', 'fireRate', 'range', 'tickInterval', 'freezeRadius', 'slow'];

function formatStat(key, value) {
  if (key === 'slow') return `${Math.round((1 - value) * 100)}%`;
  if (key === 'tickInterval') return `${value}s`;
  return String(value);
}

/** Side panel: pick a tower to build on a tile, or upgrade / sell an existing tower. */
export class BuildPanel {
  constructor(root, { towerDefs, towerOrder }) {
    this.root = root;
    this.towerDefs = towerDefs;
    this.towerOrder = towerOrder;
    this.onPreview = null;
    this.onBuild = null;
    this.onUpgrade = null;
    this.onSell = null;
    this.onClose = null;
    this.target = null; // { kind:'build', tile } | { kind:'tower', tower }
  }

  get visible() {
    return !this.root.hidden;
  }

  showBuild(tile, gold) {
    this.target = { kind: 'build', tile };
    this.#renderBuild(gold);
    this.root.hidden = false;
  }

  showTower(tower, gold) {
    this.target = { kind: 'tower', tower };
    this.#renderTower(gold);
    this.root.hidden = false;
  }

  refresh(gold) {
    if (!this.visible || !this.target) return;
    if (this.target.kind === 'build') this.#renderBuild(gold);
    else this.#renderTower(gold);
  }

  hide() {
    this.root.hidden = true;
    this.target = null;
  }

  #header(title) {
    return `<div class="panel-header"><h2>${title}</h2><button class="btn small" data-action="close">${t('build.close')}</button></div>`;
  }

  #renderBuild(gold) {
    const { tile } = this.target;
    const items = this.towerOrder
      .map((type) => {
        const cost = this.towerDefs[type].levels[0].cost;
        const ok = gold >= cost;
        return `<button class="tower-choice ${ok ? '' : 'too-expensive'}" data-type="${type}" ${ok ? '' : 'disabled'}>
            <span class="tower-name">${t(`tower.${type}.name`)}</span>
            <span class="tower-blurb">${t(`tower.${type}.blurb`)}</span>
            <span class="tower-cost">${t('build.cost', { cost })}</span>
          </button>`;
      })
      .join('');
    this.root.innerHTML = `${this.#header(t('build.title', { x: tile.x, y: tile.y }))}<div class="tower-list">${items}</div>`;
    this.#bindCommon();
    for (const btn of this.root.querySelectorAll('.tower-choice')) {
      btn.addEventListener('mouseenter', () => this.onPreview?.(btn.dataset.type));
      btn.addEventListener('mouseleave', () => this.onPreview?.(null));
      btn.addEventListener('click', () => this.onBuild?.(btn.dataset.type));
    }
  }

  #renderTower(gold) {
    const { tower } = this.target;
    const stats = STAT_KEYS.filter((k) => k in tower.stats)
      .map((k) => `<li><span>${t(`build.stat.${k}`)}</span><strong>${formatStat(k, tower.stats[k])}</strong></li>`)
      .join('');
    const canUpgrade = tower.canUpgrade;
    const affordable = canUpgrade && gold >= tower.upgradeCost;
    this.root.innerHTML = `${this.#header(t('build.towerTitle', { name: t(`tower.${tower.type}.name`), level: tower.level + 1 }))}
      <p class="tower-blurb">${t(`tower.${tower.type}.blurb`)}</p>
      <ul class="stats">${stats}</ul>
      <div class="panel-actions">
        <button class="btn primary" data-action="upgrade" ${affordable ? '' : 'disabled'}>${canUpgrade ? t('build.upgrade', { cost: tower.upgradeCost }) : t('build.maxLevel')}</button>
        <button class="btn danger" data-action="sell">${t('build.sell', { refund: tower.sellRefund })}</button>
      </div>`;
    this.#bindCommon();
    this.root.querySelector('[data-action="upgrade"]').addEventListener('click', () => this.onUpgrade?.());
    this.root.querySelector('[data-action="sell"]').addEventListener('click', () => this.onSell?.());
  }

  #bindCommon() {
    this.root.querySelector('[data-action="close"]').addEventListener('click', () => this.onClose?.());
  }
}
```

- [ ] **Step 4: Write GameScreen.js**

`client/src/ui/GameScreen.js`:
```js
import { Game } from '../game/Game.js';
import { GameSession } from '../render/GameSession.js';
import { MAPS, TOWER_DEFS, ENEMY_DEFS, TOWER_ORDER } from '../data/index.js';
import { t } from '../i18n/i18n.js';
import { Hud } from './Hud.js';
import { BuildPanel } from './BuildPanel.js';
import { InputController } from './InputController.js';

/** One playthrough: game + session + HUD + build panel + input. */
export class GameScreen {
  constructor({ mapId, sceneManager, models, onEnd, onQuit }) {
    this.sceneManager = sceneManager;
    this.onEnd = onEnd;
    this.onQuit = onQuit;
    this.game = new Game({ map: MAPS[mapId], towerDefs: TOWER_DEFS, enemyDefs: ENEMY_DEFS });
    this.session = new GameSession({ game: this.game, sceneManager, models });
    this.hud = new Hud(document.getElementById('hud'));
    this.panel = new BuildPanel(document.getElementById('build-panel'), { towerDefs: TOWER_DEFS, towerOrder: TOWER_ORDER });
    this.speed = 1;
    this.paused = false;
    this.selectedTile = null;
    this.selectedTower = null;
    this.previewType = null;

    this.input = new InputController(sceneManager.canvas, {
      pickTile: (x, y) => this.session.pickTile(x, y),
      onTileClick: (tile) => this.#onTileClick(tile),
      onTileHover: () => {},
      onCancel: () => this.closePanel(),
    });

    this.hud.onNextWave = () => this.game.startNextWave();
    this.hud.onAutoToggle = () => this.game.setAutoWave(!this.game.autoWave);
    this.hud.onSpeedToggle = () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.session.speed = this.speed;
    };
    this.hud.onMenu = () => this.onQuit?.();

    this.panel.onPreview = (type) => {
      this.previewType = type;
      if (type && this.selectedTile) this.session.showGhost(type, this.selectedTile);
      else this.session.hideGhost();
    };
    this.panel.onBuild = (type) => {
      if (!this.selectedTile) return;
      const r = this.game.buildTower(type, this.selectedTile.x, this.selectedTile.y);
      if (r.ok) this.closePanel();
      else if (r.error === 'notEnoughGold') this.hud.toast(t('build.tooExpensive'));
    };
    this.panel.onUpgrade = () => {
      if (!this.selectedTower) return;
      const r = this.game.upgradeTower(this.selectedTower.id);
      if (r.ok) this.panel.showTower(this.selectedTower, this.game.economy.gold);
      else if (r.error === 'notEnoughGold') this.hud.toast(t('build.tooExpensive'));
    };
    this.panel.onSell = () => {
      if (!this.selectedTower) return;
      this.game.sellTower(this.selectedTower.id);
      this.closePanel();
    };
    this.panel.onClose = () => this.closePanel();

    this.unsubscribe = [
      this.game.on('economy:changed', () => this.panel.refresh(this.game.economy.gold)),
      this.game.on('wave:started', ({ wave }) => this.hud.toast(t('hud.waveIncoming', { wave }))),
      this.game.on('wave:ended', ({ wave, bonusGold, bonusScore }) => this.hud.toast(t('hud.waveCleared', { wave, gold: bonusGold, score: bonusScore }))),
      this.game.on('game:won', (p) => this.onEnd?.({ won: true, ...p })),
      this.game.on('game:lost', (p) => this.onEnd?.({ won: false, ...p })),
    ];

    sceneManager.onFrame = (dt) => {
      this.session.update(this.paused ? 0 : dt);
      this.hud.render(this.game, this.speed);
    };
    this.hud.render(this.game, this.speed);
    this.hud.show();
  }

  #onTileClick(tile) {
    if (!tile) return this.closePanel();
    const tower = this.game.towerAt(tile.x, tile.y);
    if (tower) {
      this.selectedTower = tower;
      this.selectedTile = null;
      this.session.hideGhost();
      this.panel.showTower(tower, this.game.economy.gold);
      return;
    }
    if (this.game.grid.isBuildable(tile.x, tile.y)) {
      this.selectedTile = tile;
      this.selectedTower = null;
      this.panel.showBuild(tile, this.game.economy.gold);
      if (this.previewType) this.session.showGhost(this.previewType, tile);
      return;
    }
    this.closePanel();
  }

  closePanel() {
    this.panel.hide();
    this.session.hideGhost();
    this.selectedTile = null;
    this.selectedTower = null;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  dispose() {
    for (const off of this.unsubscribe) off();
    this.sceneManager.onFrame = null;
    this.input.dispose();
    this.closePanel();
    this.hud.hide();
    this.session.dispose();
  }
}
```

- [ ] **Step 5: Replace style.css with the full cartoon UI styling**

`client/src/style.css`:
```css
:root {
  --ink: #2b1d0e;
  --paper: #fff7e6;
  --paper-2: #ffe9c2;
  --accent: #ffb347;
  --accent-2: #6fd36f;
  --danger: #ff6b6b;
  --info: #7fd3ff;
  --sky: #9ad7ff;
  --radius: 14px;
  --shadow: 0 6px 0 rgba(43, 29, 14, 0.25);
  font-family: "Trebuchet MS", "Comic Sans MS", "Segoe UI", sans-serif;
}
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--sky); }
#game { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#ui { position: fixed; inset: 0; pointer-events: none; color: var(--ink); }
#ui > * { pointer-events: auto; }
[hidden] { display: none !important; }
h1, h2, h3 { margin: 0; letter-spacing: 0.02em; }
button { font: inherit; cursor: pointer; }

.btn {
  border: 3px solid var(--ink);
  border-radius: var(--radius);
  background: var(--paper);
  color: var(--ink);
  padding: 0.45rem 0.9rem;
  font-weight: 700;
  box-shadow: var(--shadow);
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.btn:hover:not(:disabled) { transform: translateY(-2px); }
.btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 rgba(43, 29, 14, 0.25); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: var(--accent); }
.btn.danger { background: var(--danger); }
.btn.small { padding: 0.25rem 0.6rem; font-size: 0.85rem; }
.btn.toggle[aria-pressed="true"] { background: var(--accent-2); }

#hud { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 0.6rem; }
.hud-bar {
  display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; justify-content: center;
  background: var(--paper); border: 3px solid var(--ink); border-radius: var(--radius); padding: 0.4rem 0.8rem; box-shadow: var(--shadow);
}
.stat { display: flex; flex-direction: column; align-items: center; min-width: 4.5rem; line-height: 1.1; }
.stat .label { font-size: 0.7rem; text-transform: uppercase; opacity: 0.7; }
.stat .value { font-size: 1.25rem; font-weight: 800; }
.stat.wave { font-weight: 800; font-size: 1rem; }
.toast {
  background: var(--ink); color: var(--paper); padding: 0.4rem 1rem; border-radius: 999px; font-weight: 700;
  animation: toast-in 0.25s ease-out;
}
@keyframes toast-in { from { transform: translateY(-10px) scale(0.9); opacity: 0; } to { transform: none; opacity: 1; } }

#build-panel {
  position: absolute; right: 0.8rem; bottom: 0.8rem; width: min(22rem, calc(100vw - 1.6rem));
  background: var(--paper); border: 3px solid var(--ink); border-radius: var(--radius); box-shadow: var(--shadow); padding: 0.8rem;
  max-height: calc(100vh - 8rem); overflow-y: auto;
}
.panel-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
.panel-header h2 { font-size: 1.05rem; }
.tower-list { display: grid; gap: 0.5rem; }
.tower-choice {
  display: grid; text-align: left; gap: 0.15rem; padding: 0.5rem 0.7rem;
  background: var(--paper-2); border: 3px solid var(--ink); border-radius: var(--radius); color: var(--ink);
}
.tower-choice:hover:not(:disabled) { background: var(--accent); }
.tower-choice.too-expensive { opacity: 0.55; }
.tower-name { font-weight: 800; }
.tower-blurb { font-size: 0.85rem; opacity: 0.85; }
.tower-cost { font-weight: 700; color: #7a4b23; }
.stats { list-style: none; padding: 0; margin: 0.5rem 0; display: grid; gap: 0.25rem; }
.stats li { display: flex; justify-content: space-between; border-bottom: 2px dashed rgba(43, 29, 14, 0.2); padding: 0.15rem 0; }
.panel-actions { display: grid; gap: 0.5rem; margin-top: 0.5rem; }

#menu, #dialog {
  position: absolute; inset: 0; display: grid; place-items: center; padding: 1rem;
  background: rgba(43, 29, 14, 0.35); backdrop-filter: blur(2px);
}
.card {
  background: var(--paper); border: 4px solid var(--ink); border-radius: 22px; box-shadow: var(--shadow);
  padding: 1.4rem; width: min(52rem, 100%); max-height: calc(100vh - 2rem); overflow-y: auto;
}
.card h1 { font-size: 2.4rem; }
.card .subtitle { margin: 0.2rem 0 1rem; opacity: 0.8; }
.map-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.8rem; }
.map-card {
  border: 3px solid var(--ink); border-radius: var(--radius); padding: 0.8rem; display: grid; gap: 0.4rem; color: var(--ink);
}
.map-card[data-theme="green"] { background: #bfe9a4; }
.map-card[data-theme="snow"] { background: #e6f0ff; }
.map-card[data-theme="desert"] { background: #ffe1a3; }
.map-card[data-theme="water"] { background: #b3e5ea; }
.map-card.unavailable { opacity: 0.5; }
.map-card h3 { font-size: 1.15rem; }
.map-card p { margin: 0; font-size: 0.9rem; }
.map-card .best { font-size: 0.85rem; font-weight: 700; }
.map-card .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.howto { margin-top: 1rem; font-size: 0.9rem; opacity: 0.8; }
.dialog-card { width: min(28rem, 100%); text-align: center; display: grid; gap: 0.7rem; }
.dialog-card input {
  font: inherit; padding: 0.5rem 0.8rem; border: 3px solid var(--ink); border-radius: var(--radius); text-align: center;
}
.dialog-actions { display: grid; gap: 0.5rem; }
.status { font-weight: 700; min-height: 1.3rem; }
table.scores { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
table.scores th, table.scores td { padding: 0.3rem 0.5rem; text-align: left; border-bottom: 2px dashed rgba(43, 29, 14, 0.2); }
table.scores td.num, table.scores th.num { text-align: right; }
.offline-badge { display: inline-block; background: var(--danger); color: var(--paper); border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.8rem; font-weight: 700; }
#fatal { position: absolute; inset: 0; display: grid; place-items: center; background: var(--paper); font-size: 1.3rem; padding: 2rem; text-align: center; }
@media (max-width: 640px) {
  .stat { min-width: 3.4rem; }
  .stat .value { font-size: 1rem; }
  #build-panel { right: 0.4rem; left: 0.4rem; bottom: 0.4rem; width: auto; }
}
```

- [ ] **Step 6: Replace main.js to use GameScreen**

`client/src/main.js`:
```js
import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameScreen } from './ui/GameScreen.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  await loadLanguage('en');
  const canvas = document.getElementById('game');
  let sceneManager;
  try {
    sceneManager = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    showFatal(t('app.webglMissing'));
    return;
  }
  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);
  sceneManager.start();

  const mapId = new URLSearchParams(location.search).get('map') ?? 'green';
  const screen = new GameScreen({
    mapId,
    sceneManager,
    models,
    onEnd: (result) => console.log('game over', result),
    onQuit: () => console.log('quit requested'),
  });
  if (import.meta.env.DEV) window.__tt = { game: screen.game, session: screen.session, screen };
}

boot();
```

- [ ] **Step 7: Verify in the browser**

Open `http://localhost:5173/?map=green`. Expected: the HUD shows Gold 200, Score 0, Lives 20, "Wave 0 / 20". Click a grass tile: the build panel lists the four towers with costs; hovering a tower shows a translucent ghost with a green range ring on the tile (red if too expensive); clicking builds it and the panel closes. Click a built tower: level, stats, Upgrade and Sell buttons work and the gold updates. Press Next wave: trolls appear, the button changes to "Call early (+10% bonus)"; toasts appear on wave start/end. Auto toggles green and shows a countdown; Speed toggles 1×/2×. Esc closes the panel. Dragging to rotate does not open panels. Nothing errors in the console.

- [ ] **Step 8: Build and commit**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm run build`
Expected: `✓ built`.

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src && git commit -m "feat(ui): add HUD, build panel, input handling and game screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Menu, end/pause dialogs and highscores

**Files:**
- Create: `client/src/ui/html.js`, `client/src/ui/Highscores.js`, `client/src/ui/Menu.js`, `client/src/ui/Dialogs.js`
- Modify: `client/src/main.js` (replace)
- Test: `client/src/ui/Highscores.test.js` (pure helpers only)

**Interfaces:**
- Produces: `escapeHtml(str)`.
- Highscores: `fetchTop(map, limit)`, `submitScore({name,map,score,wave}) → {online, rank?}`, `getPending()`, `flushPending() → sentCount`, `personalBest(map)`, `recordBest(map, score)`, `rememberName(name)`, `rememberedName()`, `localScores(map)`, `renderScoresTable(rows) → html`. All storage access is wrapped so a missing `localStorage` never throws.
- `class Menu(rootEl, { onPlay })` with `show()`, `hide()`.
- `showEndDialog(rootEl, { won, score, wave, onSubmit, onEndless, onMenu })`, `showPauseDialog(rootEl, { onResume, onQuit })`, `hideDialog(rootEl)`.

- [ ] **Step 1: Write the failing test for the pure helpers**

`client/src/ui/Highscores.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('Highscores helpers', () => {
  let mod;
  beforeEach(async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.resetModules();
    mod = await import('./Highscores.js');
  });

  it('records and reads personal bests', () => {
    expect(mod.personalBest('green')).toBeNull();
    mod.recordBest('green', 100);
    mod.recordBest('green', 50);
    expect(mod.personalBest('green')).toBe(100);
    mod.recordBest('green', 150);
    expect(mod.personalBest('green')).toBe(150);
  });

  it('queues scores when the server is unreachable and flushes later', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await mod.submitScore({ name: 'Ann', map: 'green', score: 10, wave: 2 });
    expect(r).toEqual({ online: false });
    expect(mod.getPending()).toHaveLength(1);
    expect(mod.localScores('green')[0].name).toBe('Ann');
    expect(mod.rememberedName()).toBe('Ann');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rank: 3 }) }));
    expect(await mod.flushPending()).toBe(1);
    expect(mod.getPending()).toHaveLength(0);
    const online = await mod.submitScore({ name: 'Ann', map: 'green', score: 20, wave: 3 });
    expect(online).toEqual({ online: true, rank: 3 });
  });

  it('renders an escaped scores table', () => {
    const html = mod.renderScoresTable([{ name: '<b>x</b>', score: 5, wave: 1 }]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('never throws without localStorage', async () => {
    vi.stubGlobal('localStorage', undefined);
    vi.resetModules();
    const m = await import('./Highscores.js');
    expect(m.personalBest('green')).toBeNull();
    expect(() => m.recordBest('green', 1)).not.toThrow();
    expect(m.getPending()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/ui`
Expected: FAIL, cannot find `./Highscores.js`.

- [ ] **Step 3: Write html.js and Highscores.js**

`client/src/ui/html.js`:
```js
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => MAP[c]);
}
```

`client/src/ui/Highscores.js`:
```js
import { t } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';

const PENDING_KEY = 'tt.pendingScores';
const BEST_PREFIX = 'tt.best.';
const NAME_KEY = 'tt.name';

function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

async function post(entry) {
  const res = await fetch('/api/highscores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
  return res.json();
}

export async function fetchTop(map, limit = 10) {
  const res = await fetch(`/api/highscores?map=${encodeURIComponent(map)}&limit=${limit}`);
  if (!res.ok) throw new Error(`highscores failed: ${res.status}`);
  return res.json();
}

/** Submits a score; on failure queues it locally for a later flush. */
export async function submitScore(entry) {
  recordBest(entry.map, entry.score);
  rememberName(entry.name);
  try {
    const { rank } = await post(entry);
    return { online: true, rank };
  } catch (err) {
    console.warn('[highscores] could not submit, queued locally', err?.message ?? err);
    writeJson(PENDING_KEY, [...getPending(), entry]);
    return { online: false };
  }
}

export function getPending() {
  const list = readJson(PENDING_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Retries queued submissions. Returns how many were sent. */
export async function flushPending() {
  const pending = getPending();
  if (pending.length === 0) return 0;
  const remaining = [];
  let sent = 0;
  for (const entry of pending) {
    try {
      await post(entry);
      sent++;
    } catch {
      remaining.push(entry);
    }
  }
  writeJson(PENDING_KEY, remaining);
  return sent;
}

export function personalBest(map) {
  const v = readJson(BEST_PREFIX + map, null);
  return typeof v === 'number' ? v : null;
}

export function recordBest(map, score) {
  const best = personalBest(map);
  if (best === null || score > best) writeJson(BEST_PREFIX + map, score);
}

export function rememberName(name) {
  writeJson(NAME_KEY, name);
}

export function rememberedName() {
  const v = readJson(NAME_KEY, '');
  return typeof v === 'string' ? v : '';
}

/** Scores known locally (queued submissions) for a map, best first. */
export function localScores(map) {
  return getPending()
    .filter((e) => e.map === map)
    .sort((a, b) => b.score - a.score);
}

export function renderScoresTable(rows) {
  if (!rows.length) return `<p>${t('scores.empty')}</p>`;
  const body = rows
    .map(
      (r, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(r.score)}</td><td class="num">${escapeHtml(r.wave)}</td></tr>`,
    )
    .join('');
  return `<table class="scores"><thead><tr><th class="num">#</th><th>${t('scores.name')}</th><th class="num">${t('scores.score')}</th><th class="num">${t('scores.wave')}</th></tr></thead><tbody>${body}</tbody></table>`;
}
```

- [ ] **Step 4: Run the helper tests**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npx vitest run client/src/ui`
Expected: 4 passed.

- [ ] **Step 5: Write Menu.js**

`client/src/ui/Menu.js`:
```js
import { t } from '../i18n/i18n.js';
import { MAPS, MAP_ORDER, ENEMY_DEFS } from '../data/index.js';
import { validateMap } from '../game/validateMap.js';
import { personalBest, fetchTop, localScores, renderScoresTable } from './Highscores.js';

/** Main menu: map cards with personal bests, and a per-map highscore view. */
export class Menu {
  constructor(root, { onPlay }) {
    this.root = root;
    this.onPlay = onPlay;
  }

  show() {
    this.#renderMaps();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  #isAvailable(id) {
    try {
      validateMap(MAPS[id], ENEMY_DEFS);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  #renderMaps() {
    const cards = MAP_ORDER.map((id) => {
      const ok = this.#isAvailable(id);
      const best = personalBest(id);
      return `<div class="map-card ${ok ? '' : 'unavailable'}" data-theme="${id}">
          <h3>${t(`map.${id}.name`)}</h3>
          <p>${t(`map.${id}.description`)}</p>
          <span class="best">${best === null ? t('menu.noBest') : t('menu.personalBest', { score: best })}</span>
          <div class="actions">
            <button class="btn primary" data-play="${id}" ${ok ? '' : 'disabled'}>${ok ? t('menu.play') : t('menu.unavailable')}</button>
            <button class="btn" data-scores="${id}">${t('menu.highscores')}</button>
          </div>
        </div>`;
    }).join('');
    this.root.innerHTML = `<div class="card">
        <h1>${t('app.title')}</h1>
        <p class="subtitle">${t('app.subtitle')}</p>
        <h2>${t('menu.chooseMap')}</h2>
        <div class="map-grid">${cards}</div>
        <p class="howto">${t('menu.howTo')}</p>
      </div>`;
    for (const b of this.root.querySelectorAll('[data-play]')) b.addEventListener('click', () => this.onPlay(b.dataset.play));
    for (const b of this.root.querySelectorAll('[data-scores]')) b.addEventListener('click', () => this.#renderScores(b.dataset.scores));
  }

  async #renderScores(id) {
    this.root.innerHTML = `<div class="card">
        <div class="panel-header">
          <h2>${t('scores.title', { map: t(`map.${id}.name`) })}</h2>
          <button class="btn small" data-back>${t('menu.back')}</button>
        </div>
        <div data-list>${t('scores.loading')}</div>
      </div>`;
    this.root.querySelector('[data-back]').addEventListener('click', () => this.#renderMaps());
    const list = this.root.querySelector('[data-list]');
    try {
      const rows = await fetchTop(id, 10);
      list.innerHTML = renderScoresTable(rows);
    } catch {
      list.innerHTML = `<span class="offline-badge">${t('scores.offline')}</span>${renderScoresTable(localScores(id))}`;
    }
  }
}
```

- [ ] **Step 6: Write Dialogs.js**

`client/src/ui/Dialogs.js`:
```js
import { t } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';
import { rememberedName } from './Highscores.js';

export function hideDialog(root) {
  root.hidden = true;
  root.innerHTML = '';
}

/** Shown on win or loss: score, name entry + submit, optional endless, back to menu. */
export function showEndDialog(root, { won, score, wave, onSubmit, onEndless, onMenu }) {
  root.innerHTML = `<div class="card dialog-card">
      <h1>${won ? t('end.wonTitle') : t('end.lostTitle')}</h1>
      <p>${t('end.score', { score })}<br>${t('end.wave', { wave })}</p>
      <input data-name maxlength="16" placeholder="${t('end.namePlaceholder')}" value="${escapeHtml(rememberedName())}">
      <div class="status" data-status></div>
      <div class="dialog-actions">
        <button class="btn primary" data-submit>${t('end.submit')}</button>
        ${won ? `<button class="btn" data-endless>${t('end.continueEndless')}</button>` : ''}
        <button class="btn" data-menu>${t('end.backToMenu')}</button>
      </div>
    </div>`;
  root.hidden = false;
  const nameEl = root.querySelector('[data-name]');
  const statusEl = root.querySelector('[data-status]');
  const submitEl = root.querySelector('[data-submit]');
  submitEl.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    submitEl.disabled = true;
    nameEl.disabled = true;
    const result = await onSubmit(name);
    statusEl.textContent = result.online ? t('end.submitted', { rank: result.rank }) : t('end.submittedOffline');
  });
  root.querySelector('[data-endless]')?.addEventListener('click', () => onEndless());
  root.querySelector('[data-menu]').addEventListener('click', () => onMenu());
  nameEl.focus();
}

export function showPauseDialog(root, { onResume, onQuit }) {
  root.innerHTML = `<div class="card dialog-card">
      <h1>${t('pause.title')}</h1>
      <div class="dialog-actions">
        <button class="btn primary" data-resume>${t('pause.resume')}</button>
        <button class="btn danger" data-quit>${t('pause.quit')}</button>
      </div>
    </div>`;
  root.hidden = false;
  root.querySelector('[data-resume]').addEventListener('click', () => onResume());
  root.querySelector('[data-quit]').addEventListener('click', () => onQuit());
}
```

- [ ] **Step 7: Replace main.js with the full menu → game → dialog flow**

`client/src/main.js`:
```js
import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameScreen } from './ui/GameScreen.js';
import { Menu } from './ui/Menu.js';
import { showEndDialog, showPauseDialog, hideDialog } from './ui/Dialogs.js';
import { submitScore, flushPending, recordBest } from './ui/Highscores.js';
import { MAPS } from './data/index.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  await loadLanguage('en');
  const canvas = document.getElementById('game');
  let sceneManager;
  try {
    sceneManager = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    showFatal(t('app.webglMissing'));
    return;
  }
  sceneManager.setTheme({ sky: '#9ad7ff', fog: '#bfe6ff' });
  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);
  sceneManager.start();

  const dialogEl = document.getElementById('dialog');
  const menu = new Menu(document.getElementById('menu'), { onPlay: startGame });
  let screen = null;

  function quitToMenu() {
    hideDialog(dialogEl);
    screen?.dispose();
    screen = null;
    menu.show();
  }

  function startGame(mapId) {
    menu.hide();
    hideDialog(dialogEl);
    screen?.dispose();
    screen = new GameScreen({
      mapId,
      sceneManager,
      models,
      onEnd: ({ won, score, wave }) => {
        recordBest(mapId, score);
        showEndDialog(dialogEl, {
          won,
          score,
          wave,
          onSubmit: (name) => submitScore({ name, map: mapId, score, wave }),
          onEndless: () => {
            hideDialog(dialogEl);
            screen.game.startEndless();
          },
          onMenu: quitToMenu,
        });
      },
      onQuit: () => {
        screen.pause();
        showPauseDialog(dialogEl, {
          onResume: () => {
            hideDialog(dialogEl);
            screen.resume();
          },
          onQuit: quitToMenu,
        });
      },
    });
    if (import.meta.env.DEV) window.__tt = { game: screen.game, session: screen.session, screen };
  }

  flushPending().catch(() => {});
  const requested = new URLSearchParams(location.search).get('map');
  if (requested && MAPS[requested]) startGame(requested);
  else menu.show();
}

boot();
```

- [ ] **Step 8: Verify the full flow in the browser**

Run both servers with `npm run dev` from the root (client on 5173 proxies `/api` to the server on 3000). Open `http://localhost:5173/`.

Expected: the menu shows four themed map cards with "Not played yet"; "Highscores" shows "No scores yet" (or the table). Play Green Meadows: build towers, press Next wave; the Menu button pauses (trolls freeze) and Resume continues; Quit returns to the menu with the scene cleared. To test the end flow quickly, in the console run `__tt.game.economy.lives = 1` and let one troll through: the loss dialog appears, entering a name and submitting shows "Score saved! Rank #1", and the menu's highscore list for that map now shows the entry and the card shows "Your best". Stop the server (`Ctrl+C` the server only) and submit another score: the dialog says "Saved offline"; the highscore view shows the Offline badge with the local score; restart the server and reload: the pending score is flushed and appears in the list. Win flow: run `for (let i = 0; i < 19; i++) __tt.game.startNextWave();` with several cannons placed, then clear the last wave; the win dialog offers "Continue in Endless", which starts wave 21 with "Endless wave 21" in the HUD.

- [ ] **Step 9: Run everything, build and commit**

Run: `cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm test && npm run build`
Expected: all tests pass, `✓ built`.

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add client/src && git commit -m "feat(ui): add main menu, end and pause dialogs and highscores with offline queue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 19: Model contract, README, deployment and final verification

**Files:**
- Create: `docs/model-contract.md`, `README.md`, `.env.example`
- Modify: `package.json` (add `engines`)

- [ ] **Step 1: Write the model contract**

`docs/model-contract.md`:
```markdown
# Model contract (Blender → Troll Towers)

Drop `.glb` files into `client/public/models/`. The game loads them at start; anything missing falls back to a built-in placeholder, so you can replace models one at a time.

## Export settings (Blender → File → Export → glTF 2.0)
- Format: **glTF Binary (.glb)**
- Include: Selected Objects (or the whole collection for that model)
- Transform: **+Y Up** (default)
- Mesh: Apply Modifiers ✔, UVs ✔, Normals ✔, Vertex Colors ✔ (if used)
- Animation: ✔ if the model has clips (see below)

## File names
| File | What it is | Size guide |
|---|---|---|
| `tower_crossbow.glb` | Crossbow tower | ~1.6 m wide, 2–3 m tall |
| `tower_spike.glb` | Spike tower | ~1.8 m wide, 0.5–1 m tall (spikes rise out of it) |
| `tower_cannon.glb` | Cannon tower | ~1.6 m wide, 2–3 m tall |
| `tower_frozen.glb` | Frozen ice block | ~1.4 m cube |
| `troll_scout.glb` | Scout troll | ~1 m tall |
| `troll_brute.glb` | Brute troll | ~1.8 m tall |
| `troll_bat.glb` | Bat troll (flying) | ~0.8 m, hovering ~1.2 m above ground |
| `troll_boss.glb` | Boss troll | ~3 m tall |
| `decor_tree.glb`, `decor_rock.glb`, `decor_cactus.glb`, `decor_reed.glb` | Decoration | fits inside 2×2 m |
| `base_castle.glb` | The base the trolls attack | ~1.6 m wide |
| `spawn_gate.glb` | Where trolls come out | ~2 m wide, opening faces +Z |

## Scale and origin
- 1 Blender unit = 1 metre. One grid tile is **2 × 2 m**.
- Origin at the **bottom centre** of the model (it is placed exactly on the tile centre at ground level).
- Models face **+Z** ("forward"). Turrets and gates are rotated by the game around Y.

## Named parts (optional, but recommended for towers)
- `Turret` – a child object that rotates toward the target (crossbow, cannon). If missing, the whole model rotates.
- `Muzzle` – an Empty inside `Turret` where projectiles start. If missing, projectiles start 1.2 m above the turret origin.
- `Spike` – any number of meshes with this name rise 0.45 m when the spike tower ticks.
- `WingL` / `WingR` – flap on flying trolls.
- `Operator` – the little troll on the tower (purely cosmetic).

## Animations (optional)
Clips named `idle`, `shoot`, `walk`, `die` are picked up if present. Without them the game uses its own squash-and-stretch.

## Materials
Principled BSDF base colours or vertex colours. Keep textures small (≤ 1024 px). The game replaces materials with a toon shader that keeps the base colour and texture, so avoid relying on roughness/metalness.

## Checking a model
Run `npm run dev`, open the game; the console prints `[models] <name>: using placeholder` for every missing file. A loaded model prints nothing.
```

- [ ] **Step 2: Write README.md and .env.example**

`README.md`:
```markdown
# Troll Towers

A cartoon 3D tower defence for the browser. Three.js client, Express + SQLite highscore server.

## Develop
```bash
npm install
npm run dev        # client on http://localhost:5173 (proxies /api), server on :3000
npm test           # vitest: game logic + API
```

## Build and run like production
```bash
npm run build      # -> client/dist
npm start          # serves client/dist and /api on $PORT (default 3000)
```

## Deploy on CloudPanel (Node.js site)
1. Create a **Node.js** site in CloudPanel, note the **App Port** it assigns (e.g. 3000) and the site user.
2. As the site user, clone this repo into the site's root and run:
   ```bash
   npm ci
   npm run build
   ```
3. Create `.env` from `.env.example` and set `PORT` to the App Port. `DB_PATH` may point anywhere writable (default `server/data/highscores.db`).
4. Start with PM2 (installed on CloudPanel Node.js sites):
   ```bash
   pm2 start server/index.js --name troll-towers --update-env
   pm2 save
   ```
   Or set the CloudPanel site's start command to `node server/index.js`.
5. Updates: `git pull && npm ci && npm run build && pm2 restart troll-towers`.

CloudPanel's Nginx proxies the domain to the App Port, so no extra config is needed. Because the app sets `trust proxy`, the rate limiter sees real client IPs.

## Project layout
- `client/src/game/` – pure simulation (tested)
- `client/src/render/` – Three.js views and effects
- `client/src/ui/` – HTML overlay (HUD, panels, menu)
- `client/src/data/` – towers, enemies and maps (JSON)
- `client/public/models/` – your Blender `.glb` files, see `docs/model-contract.md`
- `server/` – Express API + SQLite
- `docs/superpowers/` – design spec and implementation plan

## Adding a map / tower / enemy
- Map: add `client/src/data/maps/<id>.json` (see existing ones), register it in `client/src/data/index.js`, add `map.<id>.name` / `.description` to `client/src/i18n/en.json`, add the id to `MAP_IDS` in `server/app.js`, add a theme in `client/src/render/MapRenderer.js`.
- Tower: add to `towers.json`, `TOWER_ORDER`, i18n `tower.<id>.*`, a placeholder builder in `render/placeholders.js` and `MODEL_NAMES`.
- Enemy: add to `enemies.json`, i18n `enemy.<id>.name`, placeholder + `MODEL_NAMES`.
```

`.env.example`:
```
PORT=3000
DB_PATH=server/data/highscores.db
```

Add to the root `package.json` (inside the top-level object): `"engines": { "node": ">=22" }`.

Note: `server/index.js` reads `process.env` only; PM2 `--update-env` and CloudPanel both pass `.env` values through. If `.env` should be read by plain `npm start`, run `node --env-file=.env server/index.js` (Node 20.6+), and mention this in the README's "Build and run like production" block: `node --env-file=.env server/index.js`.

- [ ] **Step 3: Final verification**

Run:
```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && npm test && npm run build && (PORT=3998 node server/index.js & echo $! > /tmp/tt-final.pid; sleep 1; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' localhost:3998/; curl -s localhost:3998/api/health; echo; curl -s -o /dev/null -w '%{http_code}\n' localhost:3998/assets/ 2>/dev/null; kill $(cat /tmp/tt-final.pid); rm -f server/data/highscores.db*)
```
Expected: all tests pass; build succeeds; `200 text/html; charset=UTF-8` for `/`; `{"ok":true}` for health. Then open `http://localhost:3998/` once more manually with the server running (`PORT=3998 npm start`) and confirm the built game loads, plays a wave, and submits a score. Stop the server and delete `server/data/highscores.db*` afterwards.

- [ ] **Step 4: Commit**

```bash
cd "/home/ubuntu/Desktop/Game - TowerDefence" && git add README.md docs/model-contract.md .env.example package.json && git commit -m "docs: add model contract, README with CloudPanel deployment

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Done criteria

- `npm test` green (game logic, data, i18n, highscore helpers, API).
- `npm run build` produces `client/dist`; `npm start` serves the game and API.
- All four maps playable from the menu with orbit/zoom camera, four towers with 3 levels, upgrade/sell, 20 waves + endless, highscores online and offline.
- Dropping a `.glb` from `docs/model-contract.md` into `client/public/models/` replaces the placeholder with no code change.
