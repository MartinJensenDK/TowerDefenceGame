import { describe, it, expect } from 'vitest';
import { Tower, SELL_FACTOR, SPLASH_INTERVAL } from './Tower.js';
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

  it('upgrades nine times to level 10 and then refuses', () => {
    const t = tower('crossbow');
    expect(t.maxLevel).toBe(9);
    expect(t.upgrade()).toBe(true);
    expect(t.level).toBe(1);
    expect(t.invested).toBe(90);
    expect(t.upgrade()).toBe(true);
    expect(t.invested).toBe(150);
    for (let i = 0; i < 7; i++) expect(t.upgrade()).toBe(true);
    expect(t.level).toBe(9);
    expect(t.invested).toBe(towers.crossbow.levels.reduce((sum, l) => sum + l.cost, 0));
    expect(t.stats.damage).toBe(54);
    expect(t.canUpgrade).toBe(false);
    expect(t.upgradeCost).toBeNull();
    expect(t.upgrade()).toBe(false);
    expect(t.sellRefund).toBe(Math.floor(t.invested * SELL_FACTOR));
  });
});

describe('Tower targeting', () => {
  it('picks the enemy closest to the tower within range by default', () => {
    const t = tower('crossbow'); // at world (5,1), range 7
    const far = enemyAt('scout', 1); // 4 units from the tower
    const near = enemyAt('scout', 6); // 1 unit from the tower
    const outOfRange = enemyAt('scout', 13); // 8 units away
    expect(t.targeting).toBe('closest');
    expect(t.pickTarget([far, near, outOfRange])).toBe(near);
  });

  it('can prefer the weakest or the strongest enemy in range', () => {
    const t = tower('crossbow');
    const scout = enemyAt('scout', 6); // 30 hp
    const brute = enemyAt('brute', 2); // 160 hp
    expect(t.setTargeting('weakest')).toBe(true);
    expect(t.pickTarget([brute, scout])).toBe(scout);
    t.setTargeting('strongest');
    expect(t.pickTarget([scout, brute])).toBe(brute);
    expect(t.setTargeting('nonsense')).toBe(false);
    expect(t.targeting).toBe('strongest');
  });

  it('breaks ties towards the enemy nearest the base', () => {
    const t = tower('crossbow');
    t.setTargeting('weakest');
    const behind = enemyAt('scout', 4); // both 30 hp
    const ahead = enemyAt('scout', 6);
    expect(t.pickTarget([behind, ahead])).toBe(ahead);
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
    expect(tower('cannon').canTarget(bat)).toBe(false);
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

  it('frozen towers deal no damage but throw cold water at nearby walkers and expose a freeze source', () => {
    const t = tower('frozen'); // at (5,1), freezeRadius 1 -> reach 3 world units
    expect(t.reach).toBe(3);
    expect(t.update(1, [])).toEqual([]);
    expect(t.update(1, [enemyAt('bat', 5)])).toEqual([]); // flyers are not on the frozen road
    expect(t.update(1, [enemyAt('scout', 9)])).toEqual([]); // 4 units away: out of reach
    const near = enemyAt('scout', 6);
    const first = t.update(1, [near]);
    expect(first).toEqual([{ type: 'splash', tower: t, target: near }]);
    expect(t.update(1, [near])).toEqual([]); // cooling down
    expect(t.update(SPLASH_INTERVAL, [near])).toHaveLength(1);
    expect(t.freezeSource()).toEqual({ x: 2, y: 0, radius: 1, slow: 0.5 });
    t.upgrade();
    expect(t.freezeSource().radius).toBe(2);
    expect(tower('crossbow').freezeSource()).toBeNull();
  });
});
