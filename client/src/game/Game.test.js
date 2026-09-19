import { describe, it, expect, vi } from 'vitest';
import { Game, AUTO_WAVE_DELAY } from './Game.js';
import { makeTestMap } from './testMap.js';
import towers from '../data/towers.json';
import enemies from '../data/enemies.json';

function makeGame(overrides = {}) {
  return new Game({ map: makeTestMap(overrides), towerDefs: towers, enemyDefs: enemies, rng: () => 0.3 });
}

/** Advance the simulation in fixed steps. */
function run(game, seconds, step = 0.05) {
  for (let t = 0; t < seconds; t += step) game.update(step);
}

describe('Game building', () => {
  it('builds a tower on a buildable tile and charges gold', () => {
    const g = makeGame();
    const built = vi.fn();
    g.on('tower:built', built);
    const r = g.buildTower('crossbow', 2, 0);
    expect(r.ok).toBe(true);
    expect(g.economy.gold).toBe(450);
    expect(g.towerAt(2, 0)).toBe(r.tower);
    expect(built).toHaveBeenCalledWith({ tower: r.tower });
  });

  it('refuses roads, occupied tiles, unknown towers and empty wallets', () => {
    const g = makeGame({ startGold: 60 });
    expect(g.buildTower('crossbow', 2, 1)).toEqual({ ok: false, error: 'notBuildable' });
    expect(g.buildTower('dragon', 2, 0)).toEqual({ ok: false, error: 'unknownTower' });
    expect(g.buildTower('cannon', 2, 0)).toEqual({ ok: false, error: 'notEnoughGold' });
    expect(g.buildTower('crossbow', 2, 0).ok).toBe(true);
    expect(g.buildTower('crossbow', 2, 0)).toEqual({ ok: false, error: 'notBuildable' });
  });

  it('upgrades and sells towers', () => {
    const g = makeGame();
    const { tower } = g.buildTower('crossbow', 2, 0);
    expect(g.upgradeTower(tower.id).ok).toBe(true);
    expect(g.economy.gold).toBe(410);
    expect(g.upgradeTower(999)).toEqual({ ok: false, error: 'noTower' });
    const sold = g.sellTower(tower.id);
    expect(sold).toEqual({ ok: true, refund: 63 });
    expect(g.economy.gold).toBe(473);
    expect(g.towerAt(2, 0)).toBeNull();
    expect(g.grid.isBuildable(2, 0)).toBe(true);
  });

  it('freezes road tiles when a frozen tower is built and thaws when sold', () => {
    const g = makeGame();
    const frozen = vi.fn();
    g.on('tile:frozenChanged', frozen);
    const { tower } = g.buildTower('frozen', 2, 0);
    expect(g.grid.speedMultiplierAt(2, 1)).toBe(0.5);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen.mock.calls[0][0].tiles).toHaveLength(3);
    g.upgradeTower(tower.id);
    expect(g.grid.frozenTiles()).toHaveLength(5);
    g.sellTower(tower.id);
    expect(g.grid.frozenTiles()).toHaveLength(0);
    expect(frozen).toHaveBeenCalledTimes(3);
  });

  it('only emits tile:frozenChanged when the frozen tile set actually changes', () => {
    const g = makeGame();
    const frozen = vi.fn();
    g.on('tile:frozenChanged', frozen);
    const { tower: first } = g.buildTower('frozen', 2, 0);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen.mock.calls[0][0].tiles).toHaveLength(3);
    expect(frozen.mock.calls[0][0].changed).toHaveLength(3);
    // A second frozen tower whose coverage of the road fully overlaps the first's
    // (same road tiles, same slow) changes nothing, so no event should fire.
    g.buildTower('frozen', 2, 2);
    expect(frozen).toHaveBeenCalledTimes(1);
    // Selling the first tower leaves the second tower still covering the same
    // tiles with the same multiplier, so still no change.
    g.sellTower(first.id);
    expect(frozen).toHaveBeenCalledTimes(1);
  });
});

describe('Game waves', () => {
  it('spawns enemies when a wave starts and ends the wave when they are gone', () => {
    const g = makeGame();
    const started = vi.fn();
    const ended = vi.fn();
    g.on('wave:started', started);
    g.on('wave:ended', ended);
    g.buildTower('cannon', 2, 0);
    expect(g.startNextWave()).toBe(true);
    expect(g.wave).toBe(1);
    expect(g.state).toBe('running');
    expect(started).toHaveBeenCalledWith({ wave: 1, early: false, endless: false });
    const spawned = vi.fn();
    g.on('enemy:spawned', spawned);
    g.update(0.05); // the cannon kills the scout in this same tick, so check the spawn event
    expect(spawned).toHaveBeenCalledTimes(1);
    run(g, 5);
    expect(g.enemies).toHaveLength(0);
    expect(ended).toHaveBeenCalledWith({ wave: 1, bonusGold: 20, bonusScore: 50, early: false });
    expect(g.state).toBe('idle');
    expect(g.countdown).toBeGreaterThan(0);
    expect(g.countdown).toBeLessThanOrEqual(AUTO_WAVE_DELAY);
    expect(g.economy.score).toBe(60); // 10 kill + 50 wave bonus
    expect(g.economy.gold).toBe(500 - 150 + 5 + 20);
  });

  it('lets enemies through when there are no towers and costs lives', () => {
    const g = makeGame();
    const reached = vi.fn();
    g.on('enemy:reachedBase', reached);
    g.startNextWave();
    run(g, 6);
    expect(reached).toHaveBeenCalledTimes(1);
    expect(g.economy.lives).toBe(19);
    expect(g.enemies).toHaveLength(0);
  });

  it('loses the game when lives reach zero', () => {
    const g = makeGame({
      waves: makeTestMap().waves.map(() => ({ spawns: [{ type: 'boss', count: 4, interval: 0.1 }] })),
    });
    const lost = vi.fn();
    g.on('game:lost', lost);
    g.startNextWave();
    run(g, 20);
    expect(g.state).toBe('lost');
    expect(lost).toHaveBeenCalledWith({ score: 0, wave: 1 });
    expect(g.startNextWave()).toBe(false);
  });

  it('adds 10% score bonus for calling the next wave early', () => {
    const g = makeGame();
    const ended = vi.fn();
    g.on('wave:ended', ended);
    g.buildTower('crossbow', 2, 0); // crossbow needs ~1.4s to kill a scout, so wave 1 is still alive
    g.startNextWave();
    g.update(0.05); // enemy 1 alive
    expect(g.startNextWave()).toBe(true);
    expect(g.wave).toBe(2);
    run(g, 6);
    expect(ended).toHaveBeenCalledTimes(2);
    expect(ended.mock.calls[0][0]).toMatchObject({ wave: 1, early: false, bonusScore: 50 });
    expect(ended.mock.calls[1][0]).toMatchObject({ wave: 2, early: true, bonusScore: 110 });
  });

  it('auto-starts the next wave after the countdown when enabled', () => {
    const g = makeGame();
    g.buildTower('cannon', 2, 0);
    g.setAutoWave(true);
    g.startNextWave();
    run(g, 5);
    expect(g.state).toBe('idle');
    run(g, AUTO_WAVE_DELAY + 0.1);
    expect(g.wave).toBe(2); // wave 2 auto-started (and the cannon may already have finished it)
  });

  it('wins after wave 20 and can continue into endless', () => {
    const g = makeGame();
    const won = vi.fn();
    g.on('game:won', won);
    g.buildTower('cannon', 2, 0);
    g.buildTower('cannon', 3, 2);
    for (let w = 1; w <= 20; w++) {
      expect(g.startNextWave()).toBe(true);
      run(g, 6);
    }
    expect(g.state).toBe('won');
    expect(won).toHaveBeenCalledTimes(1);
    expect(won.mock.calls[0][0].wave).toBe(20);
    expect(g.startNextWave()).toBe(false);
    expect(g.startEndless()).toBe(true);
    expect(g.state).toBe('idle');
    const started = vi.fn();
    g.on('wave:started', started);
    expect(g.startNextWave()).toBe(true);
    expect(started).toHaveBeenCalledWith({ wave: 21, early: false, endless: true });
    const spawned = vi.fn();
    g.on('enemy:spawned', spawned);
    g.update(0.05);
    expect(spawned).toHaveBeenCalled();
    const first = spawned.mock.calls[0][0].enemy;
    expect(first.type).toBe('scout'); // rng 0.3 always picks the scout entry
    expect(first.maxHp).toBe(Math.round(enemies.scout.hp * (1 + 0.06 * 20)));
  });

  it('cannon splash damages nearby enemies and spike towers tick', () => {
    const g = makeGame({ waves: makeTestMap().waves.map(() => ({ spawns: [{ type: 'brute', count: 3, interval: 0.2 }] })) });
    const hits = vi.fn();
    g.on('enemy:hit', hits);
    g.buildTower('cannon', 5, 0);
    g.buildTower('spike', 0, 0);
    g.startNextWave();
    // The cannon's first shot (fireRate 0.5 => 2s cooldown) always lands on the lone
    // lead brute, since the other two haven't spawned yet (0.2s stagger) by the time
    // it comes into range (~0.15s). Splash only appears on the second shot, ~2s later,
    // once all three brutes are bunched together in range. 1.5s isn't enough for that
    // second shot to fire; 2.5s is.
    run(g, 2.5);
    const types = new Set(hits.mock.calls.map((c) => c[0].towerType));
    expect(types.has('cannon')).toBe(true);
    expect(types.has('spike')).toBe(true);
    const cannonHitsInOneShot = hits.mock.calls.filter((c) => c[0].towerType === 'cannon' && c[0].damage === 20);
    expect(cannonHitsInOneShot.length).toBeGreaterThan(0);
  });

  it('rejects an invalid map at construction', () => {
    expect(() => makeGame({ base: [0, 0] })).toThrow(/base must be on a road tile/);
  });
});
