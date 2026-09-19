import { describe, it, expect } from 'vitest';
import { Grid, TILE_SIZE } from './Grid.js';
import { makeTestMap } from './testMap.js';

describe('Grid', () => {
  it('converts between tile and world coordinates', () => {
    const g = new Grid(makeTestMap());
    expect(TILE_SIZE).toBe(2);
    expect(g.tileToWorld(0, 0)).toEqual({ x: 1, z: 1 });
    expect(g.tileToWorld(3, 1)).toEqual({ x: 7, z: 3 });
    expect(g.worldToTile(7.9, 2.1)).toEqual({ x: 3, y: 1 });
    expect(g.worldToTile(-0.5, 0)).toEqual({ x: -1, y: 0 });
  });

  it('reports tile types and bounds', () => {
    const g = new Grid(makeTestMap());
    expect(g.tileAt(0, 1)).toBe('R');
    expect(g.tileAt(0, 0)).toBe('.');
    expect(g.tileAt(6, 0)).toBeNull();
    expect(g.isRoad(2, 1)).toBe(true);
    expect(g.isBuildable(2, 0)).toBe(true);
    expect(g.isBuildable(2, 1)).toBe(false);
  });

  it('tracks occupancy', () => {
    const g = new Grid(makeTestMap());
    g.occupy(2, 0, 7);
    expect(g.isBuildable(2, 0)).toBe(false);
    expect(g.towerIdAt(2, 0)).toBe(7);
    g.release(2, 0);
    expect(g.isBuildable(2, 0)).toBe(true);
    expect(g.towerIdAt(2, 0)).toBeNull();
  });

  it('converts a path to world waypoints', () => {
    const g = new Grid(makeTestMap());
    expect(g.pathToWorld(0)).toEqual([{ x: 1, z: 3 }, { x: 11, z: 3 }]);
  });

  it('finds road tiles within a Chebyshev radius', () => {
    const g = new Grid(makeTestMap());
    expect(g.roadTilesWithin(2, 0, 1).sort()).toEqual([[1, 1], [2, 1], [3, 1]].sort());
    expect(g.roadTilesWithin(2, 0, 2)).toHaveLength(5);
  });

  it('recomputes frozen tiles from sources and reports changes', () => {
    const g = new Grid(makeTestMap());
    const changed = g.recomputeFrozen([{ x: 2, y: 0, radius: 1, slow: 0.5 }]);
    expect(changed).toHaveLength(3);
    expect(g.speedMultiplierAt(2, 1)).toBe(0.5);
    expect(g.speedMultiplierAt(4, 1)).toBe(1);
    expect(g.frozenTiles()).toHaveLength(3);
    const changed2 = g.recomputeFrozen([]);
    expect(changed2).toHaveLength(3);
    expect(g.frozenTiles()).toHaveLength(0);
  });

  it('applies the map frost bonus and keeps the strongest slow', () => {
    const g = new Grid(makeTestMap({ modifiers: { frostBonus: 1.25 } }));
    g.recomputeFrozen([
      { x: 2, y: 0, radius: 1, slow: 0.5 },
      { x: 2, y: 2, radius: 1, slow: 0.8 },
    ]);
    expect(g.speedMultiplierAt(2, 1)).toBeCloseTo(0.375);
  });

  it('never slows below 0.1', () => {
    const g = new Grid(makeTestMap({ modifiers: { frostBonus: 3 } }));
    g.recomputeFrozen([{ x: 2, y: 0, radius: 1, slow: 0.5 }]);
    expect(g.speedMultiplierAt(2, 1)).toBe(0.1);
  });
});
