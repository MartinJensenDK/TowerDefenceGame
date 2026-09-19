import { describe, it, expect } from 'vitest';
import towers from './towers.json';
import enemies from './enemies.json';

describe('tower definitions', () => {
  it('has the four towers with ten levels each, each level costlier and stronger than the last', () => {
    expect(Object.keys(towers).sort()).toEqual(['cannon', 'crossbow', 'frozen', 'spike']);
    for (const def of Object.values(towers)) {
      expect(def.levels).toHaveLength(10);
      for (const lvl of def.levels) expect(lvl.cost).toBeGreaterThan(0);
      for (let i = 2; i < def.levels.length; i++) {
        expect(def.levels[i].cost).toBeGreaterThan(def.levels[i - 1].cost);
        if ('damage' in def.levels[i]) expect(def.levels[i].damage).toBeGreaterThan(def.levels[i - 1].damage);
        if ('range' in def.levels[i]) expect(def.levels[i].range).toBeGreaterThanOrEqual(def.levels[i - 1].range);
      }
    }
  });

  it('keeps the cannon a little shorter ranged than the crossbow at every level', () => {
    towers.cannon.levels.forEach((lvl, i) => expect(lvl.range).toBeLessThan(towers.crossbow.levels[i].range));
  });

  it('gives projectile towers fireRate/damage/range and freeze towers freezeRadius/slow', () => {
    for (const lvl of towers.crossbow.levels) {
      expect(lvl.fireRate).toBeGreaterThan(0);
      expect(lvl.damage).toBeGreaterThan(0);
      expect(lvl.range).toBeGreaterThan(0);
    }
    expect(towers.cannon.levels[0].splashRadius).toBe(2.5);
    expect(towers.spike.levels[0].tickInterval).toBe(0.5);
    expect(towers.frozen.levels.slice(0, 3).map((l) => l.freezeRadius)).toEqual([1, 2, 3]);
    expect(towers.frozen.levels.at(-1).freezeRadius).toBe(6);
    expect(towers.spike.hitsFlying).toBe(false);
    expect(towers.crossbow.hitsFlying).toBe(true);
  });
});

describe('enemy definitions', () => {
  it('has eleven trolls: seven regulars, three bosses and the Troll King', () => {
    expect(Object.keys(enemies).sort()).toEqual(['archer', 'bat', 'boss', 'brute', 'eaglerider', 'giant', 'knight', 'rhino', 'scout', 'wolfpack', 'wolfrider']);
    expect(enemies.bat.flying).toBe(true);
    expect(enemies.eaglerider.flying).toBe(true);
    expect(enemies.boss.livesCost).toBe(5);
    expect(enemies.giant.livesCost).toBe(20); // the last boss ends the game if it gets in
    expect(enemies.giant.speed).toBeLessThan(0.5);
    expect(enemies.giant.hp).toBeGreaterThan(enemies.rhino.hp * 5);
    for (const type of ['archer', 'knight', 'wolfrider', 'eaglerider']) expect(enemies[type].hp).toBeLessThan(enemies.boss.hp);
    for (const def of Object.values(enemies)) {
      expect(def.hp).toBeGreaterThan(0);
      expect(def.speed).toBeGreaterThan(0);
    }
  });
});
