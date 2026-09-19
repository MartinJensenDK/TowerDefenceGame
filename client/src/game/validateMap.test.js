import { describe, it, expect } from 'vitest';
import { validateMap } from './validateMap.js';
import { makeTestMap } from './testMap.js';
import enemies from '../data/enemies.json';
import green from '../data/maps/green.json';
import snow from '../data/maps/snow.json';
import desert from '../data/maps/desert.json';
import water from '../data/maps/water.json';

describe('validateMap', () => {
  it('accepts the test map and the green map', () => {
    expect(validateMap(makeTestMap(), enemies)).toBe(true);
    expect(validateMap(green, enemies)).toBe(true);
  });

  it('accepts all four shipped maps', () => {
    for (const map of [green, snow, desert, water]) {
      expect(validateMap(map, enemies)).toBe(true);
    }
  });

  it('rejects a path that leaves the road', () => {
    const map = makeTestMap({ tiles: ['....CCC', 'RRR.RRC', '....CCC'] });
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
    const map = makeTestMap({ tiles: ['R...CCC', 'RRRRRRC', '....CCC'], paths: [[[0, 0], [5, 1]]] });
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
    expect(() => validateMap(makeTestMap({ tiles: ['...X...', 'RRRRRRR', '.......'] }), enemies)).toThrow(/invalid tile 'X'/);
  });

  it('rejects spawns that reference a missing path', () => {
    const waves = makeTestMap().waves;
    waves[0] = { spawns: [{ type: 'scout', count: 1, interval: 1, path: 1 }] };
    expect(() => validateMap(makeTestMap({ waves }), enemies)).toThrow(/unknown path 1/);
  });

  it('rejects an empty paths array', () => {
    const map = makeTestMap({ paths: [] });
    expect(() => validateMap(map, enemies)).toThrow(/at least one path required/);
  });

  it('rejects a spawn with invalid interval', () => {
    const waves = makeTestMap().waves;
    waves[0] = { spawns: [{ type: 'scout', count: 1, interval: 0 }] };
    expect(() => validateMap(makeTestMap({ waves }), enemies)).toThrow(/invalid interval/);
  });

  it('rejects negative startGold', () => {
    const map = makeTestMap({ startGold: -5 });
    expect(() => validateMap(map, enemies)).toThrow(/startGold must be a non-negative number/);
  });
});

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
    // Base sits on the map's last column, so its 3x3 footprint spills past the east edge.
    const map = makeTestMap({
      tiles: ['....CCC', 'RRRRRRR', '....CCC'],
      base: [6, 1],
      paths: [[[0, 1], [6, 1]]],
    });
    expect(() => validateMap(map, enemies)).toThrow(/footprint/);
  });
});
