import { describe, it, expect } from 'vitest';
import { validateMap } from '../game/validateMap.js';
import { BOSS_TYPES } from '../game/waveTable.js';
import { MAPS, MAP_ORDER, ENEMY_DEFS, TOWER_DEFS } from './index.js';

describe('shipped maps', () => {
  it('lists six maps in order', () => {
    expect(MAP_ORDER).toEqual(['green', 'snow', 'desert', 'water', 'vast', 'dunes']);
    expect(Object.keys(TOWER_DEFS)).toHaveLength(4);
    expect(Object.keys(ENEMY_DEFS)).toHaveLength(11);
  });

  for (const id of ['green', 'snow', 'desert', 'water']) {
    it(`${id} validates and matches its id/theme`, () => {
      const map = MAPS[id];
      expect(map.id).toBe(id);
      expect(map.theme).toBe(id);
      expect(validateMap(map, ENEMY_DEFS)).toBe(true);
    });
  }

  for (const [id, theme, pathCount] of [['vast', 'green', 1], ['dunes', 'desert', 3]]) {
    it(`${id} is a generated 100x100 map with ${pathCount} path(s)`, () => {
      const map = MAPS[id];
      expect(map.id).toBe(id);
      expect(map.theme).toBe(theme);
      expect([map.width, map.height]).toEqual([100, 100]);
      expect(map.paths).toHaveLength(pathCount);
      expect(map.modifiers.waveInterval).toBe(45);
      expect(validateMap(map, ENEMY_DEFS)).toBe(true);
    });
  }

  it('has 50 waves on every map with a boss every 10th and the Troll King last', () => {
    for (const map of Object.values(MAPS)) {
      expect(map.waves).toHaveLength(50);
      for (const w of [9, 19, 29, 39]) {
        expect(map.waves[w].spawns.some((s) => BOSS_TYPES.includes(s.type))).toBe(true);
      }
      expect(map.waves[49].spawns[0].type).toBe('giant');
      expect(map.waves.filter((w) => w.spawns.some((s) => s.type === 'giant'))).toHaveLength(1);
    }
  });

  it('spreads every big map\'s waves over all of its roads', () => {
    for (const id of ['water', 'dunes']) {
      const map = MAPS[id];
      const used = new Set(map.waves.flatMap((w) => w.spawns.map((s) => s.path ?? 0)));
      expect(used.size).toBe(map.paths.length);
    }
  });

  it('gives the water map two paths and the snow map a frost bonus', () => {
    expect(MAPS.water.paths).toHaveLength(2);
    expect(MAPS.water.waves.some((w) => w.spawns.some((s) => s.path === 1))).toBe(true);
    expect(MAPS.snow.modifiers.frostBonus).toBe(1.25);
  });
});
