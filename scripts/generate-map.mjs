#!/usr/bin/env node
/**
 * Seeded generator for the big 100x100 maps.
 *
 * Usage:
 *   node scripts/generate-map.mjs --id vast --name "Vast Meadows" --theme green --seed 7 \
 *     --description "A huge open valley with three long roads."
 *
 * Writes client/src/data/maps/<id>.json. The same seed always produces the same map.
 */
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

/**
 * One axis-aligned random walk from `edge` to `base`.
 * @returns {{points: number[][], tiles: Set<string>}|null} null if it wandered into the castle footprint early
 */
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
      tiles.add(`${cx},${cy}`);
      if (cx === x1 && cy === y1) return;
    }
  };
  for (let guard = 0; guard < 200; guard++) {
    if (x === bx && y === by) break;
    const remX = bx - x;
    const remY = by - y;
    let axis = Math.abs(remX) >= Math.abs(remY) ? 'x' : 'y';
    if (rng() < 0.25 && (axis === 'x' ? remY : remX) !== 0) axis = axis === 'x' ? 'y' : 'x';
    const rem = axis === 'x' ? remX : remY;
    let step = 0;
    if (rng() < 0.2) {
      // wander away from the base for a few tiles so the road winds instead of running straight
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

const here = () => path.dirname(fileURLToPath(import.meta.url));
let greenWaves = null;

/** The 20-wave table from green.json, scaled up 1.5x and spread across the paths. */
function waves(pathCount) {
  if (!greenWaves) {
    greenWaves = JSON.parse(readFileSync(path.join(here(), '../client/src/data/maps/green.json'), 'utf8')).waves;
  }
  return greenWaves.map((w, wi) => ({
    spawns: w.spawns.map((s, gi) => ({ ...s, count: Math.ceil(s.count * 1.5), path: (wi + gi) % pathCount })),
  }));
}

/**
 * Builds a 100x100 map with three winding roads meeting at a castle near the middle.
 * @param {{seed: number, id: string, name: string, theme: string, description?: string}} opts
 * @returns {object} map definition, ready for validateMap
 */
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
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = grid[y + dy]?.[x + dx];
        if (c === 'R' || c === 'C') return true;
      }
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
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (grid[y][x] === '.' && !nearRoadOrCastle(x, y) && rng() < 0.015) grid[y][x] = 'D';
    }
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

/** Parses `--key value` pairs; bare flags and stray values are ignored. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) continue;
    args[a.slice(2)] = next;
    i++;
  }
  return args;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  for (const k of ['id', 'name', 'theme', 'seed']) {
    if (!args[k]) {
      console.error(`missing --${k}`);
      process.exit(1);
    }
  }
  const map = generateMap({ ...args, seed: Number(args.seed) });
  const out = path.join(here(), '../client/src/data/maps', `${map.id}.json`);
  writeFileSync(out, JSON.stringify(map, null, 1) + '\n');
  console.log(`wrote ${out}: base ${map.base}, paths ${map.paths.map((p) => p.length).join('/')} waypoints`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) cli();
