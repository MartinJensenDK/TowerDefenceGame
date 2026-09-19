import { describe, it, expect } from 'vitest';
import { generateMap, MOUNTAIN } from './generate-map.mjs';
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
    expect(map.waves).toHaveLength(50);
    expect(map.waves[0].spawns[0].count).toBe(9);
  });

  it('is deterministic per seed and different across seeds', () => {
    expect(generateMap(opts)).toEqual(generateMap(opts));
    expect(generateMap({ ...opts, seed: 8 }).tiles).not.toEqual(generateMap(opts).tiles);
  });

  it('never doubles back: no segment reverses the previous one', () => {
    const map = generateMap(opts);
    for (const p of map.paths) {
      for (let i = 2; i < p.length; i++) {
        const a = [Math.sign(p[i - 1][0] - p[i - 2][0]), Math.sign(p[i - 1][1] - p[i - 2][1])];
        const b = [Math.sign(p[i][0] - p[i - 1][0]), Math.sign(p[i][1] - p[i - 1][1])];
        expect(`${b[0]},${b[1]}`).not.toBe(`${-a[0]},${-a[1]}`);
      }
    }
  });

  it('walks at most 1.6x the manhattan distance to the base', () => {
    const map = generateMap(opts);
    const [bx, by] = map.base;
    for (const p of map.paths) {
      let walked = 0;
      for (let i = 1; i < p.length; i++) walked += Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]);
      const manhattan = Math.abs(bx - p[0][0]) + Math.abs(by - p[0][1]);
      expect(walked).toBeLessThanOrEqual(1.6 * manhattan);
    }
  });

  it('keeps the castle footprint free of buildable tiles and decor', () => {
    const map = generateMap(opts);
    const [bx, by] = map.base;
    for (let y = by - 1; y <= by + 1; y++) for (let x = bx - 1; x <= bx + 1; x++) expect('CR').toContain(map.tiles[y][x]);
  });
});

describe('spawn gate footprint', () => {
  it('marks the tiles beside every spawn as non-buildable', () => {
    const map = generateMap(opts);
    for (const [[sx, sy], [nx, ny]] of map.paths) {
      const flanks = ny === sy ? [[sx, sy - 1], [sx, sy + 1]] : [[sx - 1, sy], [sx + 1, sy]];
      for (const [fx, fy] of flanks) {
        const c = map.tiles[fy]?.[fx];
        if (c !== undefined) expect(c).not.toBe('.');
      }
    }
  });
});

describe('spiral layout', () => {
  it('makes one very long road that never reverses and reaches the castle', () => {
    const map = generateMap({ ...opts, layout: 'spiral' });
    expect(validateMap(map, enemies)).toBe(true);
    expect(map.paths).toHaveLength(1);
    const p = map.paths[0];
    let length = 0;
    for (let i = 1; i < p.length; i++) {
      const dir = [Math.sign(p[i][0] - p[i - 1][0]), Math.sign(p[i][1] - p[i - 1][1])];
      length += Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1]);
      if (i > 1) {
        const prev = [Math.sign(p[i - 1][0] - p[i - 2][0]), Math.sign(p[i - 1][1] - p[i - 2][1])];
        expect(dir).not.toEqual([-prev[0], -prev[1]]);
      }
    }
    expect(length).toBeGreaterThan(800); // tight rings: roughly twice the road of the old spiral
    expect(map.waves.every((w) => w.spawns.every((s) => (s.path ?? 0) === 0))).toBe(true);
  });

  it('brings parallel rings within one tower range of each other in several places', () => {
    const map = generateMap({ ...opts, layout: 'spiral' });
    // count rows where two horizontal road runs lie 4-6 tiles apart (a crossbow between them reaches both)
    let close = 0;
    for (let y = 0; y < map.height; y++) {
      for (let dy = 4; dy <= 6; dy++) {
        const a = map.tiles[y];
        const b = map.tiles[y + dy];
        if (a && b && /R{20,}/.test(a) && /R{20,}/.test(b)) close++;
      }
    }
    expect(close).toBeGreaterThanOrEqual(3);
  });

  it('puts the 30x6 mountain on the north edge with the road below it', () => {
    const map = generateMap({ ...opts, layout: 'spiral', mountain: true });
    expect(validateMap(map, enemies)).toBe(true);
    expect(map.props).toEqual([MOUNTAIN]);
    for (let y = 0; y < 6; y++) expect(map.tiles[y].slice(35, 65)).toBe('M'.repeat(30));
    expect(map.tiles.slice(0, 6).join('')).not.toContain('R');
    expect(map.paths[0][0][1]).toBeGreaterThanOrEqual(8);
  });
});
