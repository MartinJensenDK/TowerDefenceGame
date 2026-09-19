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
