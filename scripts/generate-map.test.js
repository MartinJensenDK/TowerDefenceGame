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
