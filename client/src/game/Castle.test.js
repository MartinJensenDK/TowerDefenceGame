import { describe, it, expect, vi } from 'vitest';
import { Game } from './Game.js';
import { Barricade, castleEntry, BARRICADE_REBUILD_TIME, BARRICADE_REGEN_DELAY, BARRICADE_STOP_GAP, BARRICADE_SETBACK } from './Castle.js';
import { makeTestMap } from './testMap.js';
import towers from '../data/towers.json';
import enemies from '../data/enemies.json';
import castleDefs from '../data/castle.json';

function makeGame(overrides = {}) {
  return new Game({ map: makeTestMap(overrides), towerDefs: towers, enemyDefs: enemies, castleDefs, rng: () => 0.3 });
}

function run(game, seconds, step = 0.05) {
  for (let t = 0; t < seconds; t += step) game.update(step);
}

describe('castle entry', () => {
  it('finds where the road steps onto the 3×3 footprint', () => {
    // test map: road along row 1 from x=0 to the base at (5,1); footprint covers x 4..6
    const g = makeGame();
    const entry = castleEntry(g.pathsWorld[0], g.map.base, (x, y) => g.grid.tileToWorld(x, y));
    // boundary between tile 3 (centre 7) and tile 4 (centre 9) is x = 8; the barricade stands a bit outside it
    expect(entry.x).toBeCloseTo(8 - BARRICADE_SETBACK);
    expect(entry.z).toBeCloseTo(3);
    expect(entry.distance).toBeCloseTo(7 - BARRICADE_SETBACK);
  });
});

describe('barricade', () => {
  it('is inert until bought, then takes hits, falls and is rebuilt after a while', () => {
    const b = new Barricade({ pathIndex: 0, distance: 7, x: 8, z: 3, heading: 0 });
    expect(b.blocking).toBe(false);
    expect(b.hit(50)).toBe(false);
    b.setMaxHp(100);
    expect(b.blocking).toBe(true);
    expect(b.hit(40)).toBe(false);
    expect(b.hp).toBe(60);
    expect(b.hit(60)).toBe(true);
    expect(b.blocking).toBe(false);
    for (let t = 0; t < BARRICADE_REBUILD_TIME - 0.1; t += 0.1) expect(b.update(0.1)).toBe(false);
    expect(b.update(0.2)).toBe(true);
    expect(b.blocking).toBe(true);
    expect(b.hp).toBe(100);
  });

  it('mends itself once it has been left alone for a few seconds', () => {
    const b = new Barricade({ pathIndex: 0, distance: 7, x: 8, z: 3, heading: 0 });
    b.setMaxHp(1000);
    b.hit(500);
    b.update(BARRICADE_REGEN_DELAY - 1);
    expect(b.hp).toBe(500);
    b.update(2);
    expect(b.hp).toBeGreaterThan(500);
    b.update(100);
    expect(b.hp).toBe(1000);
  });
});

describe('castle upgrades in a game', () => {
  it('charges gold per level up to level 10 and emits castle:upgraded', () => {
    const g = makeGame({ startGold: 10000 });
    const seen = vi.fn();
    g.on('castle:upgraded', seen);
    expect(g.castle.level('barricade')).toBe(0);
    expect(g.upgradeCastle('moat')).toEqual({ ok: false, error: 'unknownUpgrade' });
    expect(g.upgradeCastle('barricade')).toEqual({ ok: true, level: 1 });
    expect(g.economy.gold).toBe(10000 - 150);
    expect(g.castle.barricades[0].maxHp).toBe(250);
    for (let i = 0; i < 9; i++) expect(g.upgradeCastle('barricade').ok).toBe(true);
    expect(g.castle.level('barricade')).toBe(10);
    expect(g.castle.barricades[0].maxHp).toBe(3400);
    expect(g.upgradeCastle('barricade')).toEqual({ ok: false, error: 'maxLevel' });
    expect(seen).toHaveBeenCalledTimes(10);
  });

  it('refuses when gold is short', () => {
    const g = makeGame({ startGold: 100 });
    expect(g.upgradeCastle('archers')).toEqual({ ok: false, error: 'notEnoughGold' });
    expect(g.castle.level('archers')).toBe(0);
  });

  it('a barricade holds walkers in front of the castle until they smash it', () => {
    const g = makeGame({ startGold: 10000 });
    g.upgradeCastle('barricade'); // 250 hp
    const smashed = vi.fn();
    g.on('barricade:smashed', smashed);
    g.startNextWave(); // scouts: 6 dps each, speed 3
    run(g, 6);
    const walkers = g.enemies.filter((e) => !e.flying);
    expect(walkers.length).toBeGreaterThan(0);
    const entry = g.castle.barricades[0].distance;
    for (const e of walkers) {
      expect(e.blockedBy).toBe(g.castle.barricades[0]);
      expect(e.traveled).toBeLessThanOrEqual(entry - BARRICADE_STOP_GAP + 1e-6);
    }
    expect(g.economy.lives).toBe(20);
    expect(g.castle.barricades[0].hp).toBeLessThan(250);
    run(g, 50); // one 6 dps scout per wave: the first one alone needs ~42 s to chop through 250 hp
    expect(smashed).toHaveBeenCalledTimes(1);
    expect(g.economy.lives).toBeLessThan(20); // they got through once it fell
  });

  it('flying trolls ignore the barricade', () => {
    const g = makeGame({ startGold: 10000, waves: Array.from({ length: 20 }, () => ({ spawns: [{ type: 'bat', count: 1, interval: 1 }] })) });
    g.upgradeCastle('barricade');
    g.startNextWave();
    run(g, 8);
    expect(g.economy.lives).toBe(19);
    expect(g.castle.barricades[0].hp).toBe(250);
  });

  it('archers on the walls shoot trolls near the castle', () => {
    const g = makeGame({ startGold: 10000 });
    const fired = vi.fn();
    g.on('tower:fired', fired);
    g.startNextWave();
    run(g, 3);
    expect(fired).not.toHaveBeenCalled();
    expect(g.upgradeCastle('archers').ok).toBe(true);
    expect(g.castle.archerCount).toBe(1);
    run(g, 3);
    expect(fired).toHaveBeenCalled();
    expect(fired.mock.calls[0][0].tower.type).toBe('castle');
    expect(fired.mock.calls[0][0].projectile).toBe('arrow');
    for (let i = 0; i < 9; i++) g.upgradeCastle('archers');
    expect(g.castle.archerCount).toBe(4);
    expect(g.castle.archers.stats.fireRate).toBeCloseTo(16); // 4 archers × 4 shots/s
    expect(g.castle.archers.stats.range).toBe(12);
  });
});
