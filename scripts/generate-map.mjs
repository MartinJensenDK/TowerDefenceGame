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
import { generateWaveTable } from '../client/src/game/waveTable.js';
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
 *
 * Every segment either steps towards the base or sidesteps perpendicular to that approach, so the
 * road winds without ever doubling back: a segment pointing straight back along the previous one
 * aborts the whole walk (the caller simply retries with fresh rng).
 *
 * @returns {{points: number[][], tiles: Set<string>}|null} null if it reversed or wandered into the castle footprint early
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
  /** True if the straight segment from (x0,y0) to (x1,y1) touches the 3x3 castle footprint. */
  const hitsFootprint = (x0, y0, x1, y1) => {
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    for (let cx = x0, cy = y0; ; cx += dx, cy += dy) {
      if (inFootprint(cx, cy, base)) return true;
      if (cx === x1 && cy === y1) return false;
    }
  };
  let prev = null;
  for (let guard = 0; guard < 200; guard++) {
    if (x === bx && y === by) break;
    const remX = bx - x;
    const remY = by - y;
    let axis = Math.abs(remX) >= Math.abs(remY) ? 'x' : 'y';
    if (rng() < 0.25 && (axis === 'x' ? remY : remX) !== 0) axis = axis === 'x' ? 'y' : 'x';
    const rem = axis === 'x' ? remX : remY;
    let nx = x;
    let ny = y;
    if (rng() < 0.2) {
      // sidestep perpendicular to the approach so the road winds instead of running straight;
      // never backwards along the approach axis, which is what made enemies turn round
      const side = (rng() < 0.5 ? -1 : 1) * randInt(rng, 3, 8);
      const sx = axis === 'x' ? x : x + side;
      const sy = axis === 'x' ? y + side : y;
      const coord = axis === 'x' ? sy : sx;
      if (coord >= 3 && coord <= SIZE - 4 && !hitsFootprint(x, y, sx, sy)) {
        nx = sx;
        ny = sy;
      }
    }
    if (nx === x && ny === y) {
      const step = Math.sign(rem) * Math.min(Math.abs(rem), randInt(rng, 4, 14));
      if (step === 0) continue;
      if (axis === 'x') nx = x + step;
      else ny = y + step;
    }
    const dir = [Math.sign(nx - x), Math.sign(ny - y)];
    // a segment pointing straight back along the previous one would make the enemies u-turn
    if (prev && dir[0] === -prev[0] && dir[1] === -prev[1]) return null;
    // reject any segment that enters the footprint unless it is the final approach along the base row/column
    const isFinal = nx === bx && ny === by;
    if (!isFinal && hitsFootprint(x, y, nx, ny)) return null;
    mark(x, y, nx, ny);
    x = nx;
    y = ny;
    prev = dir;
    points.push([x, y]);
  }
  if (x !== bx || y !== by) return null;
  return { points, tiles };
}

/**
 * One very long road: it enters from the west edge, runs round the map just inside the border,
 * spirals inward with random gaps between the rings and finally turns in to the castle.
 * @returns {{points: number[][], tiles: Set<string>}}
 */
function spiralPath(rng, base) {
  const [bx, by] = base;
  const tiles = new Set();
  const points = [];
  let x = 0;
  let y = randInt(rng, 4, 7);
  points.push([x, y]);
  const legTo = (nx, ny) => {
    const dx = Math.sign(nx - x);
    const dy = Math.sign(ny - y);
    for (let cx = x, cy = y; ; cx += dx, cy += dy) {
      tiles.add(`${cx},${cy}`);
      if (cx === nx && cy === ny) break;
    }
    x = nx;
    y = ny;
    points.push([x, y]);
  };
  // the road runs on the boundary of this box; each leg shrinks the side it just left
  let xlo = randInt(rng, 4, 7);
  let xhi = SIZE - 1 - randInt(rng, 4, 7);
  let ylo = y;
  let yhi = SIZE - 1 - randInt(rng, 4, 7);
  const fits = (a, b, c, d) => bx >= a + 3 && bx <= b - 3 && by >= c + 3 && by <= d - 3;
  const HEADINGS = ['E', 'S', 'W', 'N'];
  for (let leg = 0; leg < 60; leg++) {
    const heading = HEADINGS[leg % 4];
    const gap = randInt(rng, 12, 20);
    // the box after this leg's shrink must still hold the castle with room to spare, else turn in
    const next = heading === 'E' ? [xlo, xhi, ylo + gap, yhi] : heading === 'S' ? [xlo, xhi - gap, ylo, yhi]
      : heading === 'W' ? [xlo, xhi, ylo, yhi - gap] : [xlo + gap, xhi, ylo, yhi];
    if (!fits(...next)) break;
    if (heading === 'E') { legTo(xhi, y); ylo += gap; }
    else if (heading === 'S') { legTo(x, yhi); xhi -= gap; }
    else if (heading === 'W') { legTo(xlo, y); yhi -= gap; }
    else { legTo(x, ylo); xlo += gap; }
  }
  // final approach: keep going in the current heading until aligned with the castle, then turn in
  const heading = HEADINGS[points.length % 4 === 0 ? 3 : (points.length - 1) % 4];
  if (heading === 'E' || heading === 'W') legTo(bx, y);
  else legTo(x, by);
  legTo(bx, by);
  return { points, tiles };
}

function pickEdges(rng) {
  const edges = [...EDGES];
  const out = [];
  while (out.length < 3) out.push(edges.splice(randInt(rng, 0, edges.length - 1), 1)[0]);
  return out;
}

/** The shared 50-wave table with 1.5x as many walkers, riders and flyers, dealt across the paths. */
function waves(pathCount) {
  return generateWaveTable({ pathCount, scale: 1.5 });
}

/**
 * Builds a 100x100 map: `trails` (default) has three winding roads meeting at a castle near the middle,
 * `spiral` has one very long road that circles the map before turning in to the castle.
 * @param {{seed: number, id: string, name: string, theme: string, description?: string, layout?: 'trails'|'spiral'}} opts
 * @returns {object} map definition, ready for validateMap
 */
export function generateMap({ seed, id, name, theme, description = '', layout = 'trails' }) {
  const rng = makeRng(seed);
  const base = [randInt(rng, 35, 64), randInt(rng, 35, 64)];
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'));
  const road = new Set();
  const paths = [];
  if (layout === 'spiral') {
    const p = spiralPath(rng, base);
    paths.push(p.points);
    for (const k of p.tiles) road.add(k);
  } else {
    for (const edge of pickEdges(rng)) {
      let p = null;
      for (let attempt = 0; attempt < 50 && !p; attempt++) p = walkPath(rng, edge, base);
      if (!p) throw new Error(`seed ${seed}: could not route a path from edge ${edge}; try another seed`);
      paths.push(p.points);
      for (const k of p.tiles) road.add(k);
    }
  }
  for (const k of road) {
    const [x, y] = k.split(',').map(Number);
    grid[y][x] = 'R';
  }
  const [bx, by] = base;
  for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) if (grid[y][x] !== 'R') grid[y][x] = 'C';
  // the spawn gate is three tiles wide: the tiles beside each spawn (across the road) cannot be built on
  for (const [[sx, sy], [nx, ny]] of paths) {
    const flanks = ny === sy ? [[sx, sy - 1], [sx, sy + 1]] : [[sx - 1, sy], [sx + 1, sy]];
    for (const [fx, fy] of flanks) if (grid[fy]?.[fx] === '.') grid[fy][fx] = 'G';
  }

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
