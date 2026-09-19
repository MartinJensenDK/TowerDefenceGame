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
