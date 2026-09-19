export const TILE_SIZE = 2;

export const TILE = { BUILDABLE: '.', ROAD: 'R', WATER: 'W', DECOR: 'D', CASTLE: 'C' };

/** Tile map, tower occupancy, frozen-tile state and coordinate conversion. */
export class Grid {
  constructor(map) {
    this.map = map;
    this.width = map.width;
    this.height = map.height;
    this.tiles = map.tiles;
    this.frostBonus = map.modifiers?.frostBonus ?? 1;
    this.occupied = new Map(); // "x,y" -> towerId
    this.frozen = new Map(); // "x,y" -> speed multiplier (< 1)
  }

  static key(x, y) {
    return `${x},${y}`;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x, y) {
    return this.inBounds(x, y) ? this.tiles[y][x] : null;
  }

  isRoad(x, y) {
    return this.tileAt(x, y) === TILE.ROAD;
  }

  isBuildable(x, y) {
    return this.tileAt(x, y) === TILE.BUILDABLE && !this.occupied.has(Grid.key(x, y));
  }

  occupy(x, y, towerId) {
    this.occupied.set(Grid.key(x, y), towerId);
  }

  release(x, y) {
    this.occupied.delete(Grid.key(x, y));
  }

  towerIdAt(x, y) {
    return this.occupied.get(Grid.key(x, y)) ?? null;
  }

  tileToWorld(x, y) {
    return { x: (x + 0.5) * TILE_SIZE, z: (y + 0.5) * TILE_SIZE };
  }

  worldToTile(wx, wz) {
    return { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wz / TILE_SIZE) };
  }

  pathToWorld(pathIndex) {
    return this.map.paths[pathIndex].map(([x, y]) => this.tileToWorld(x, y));
  }

  /** Road tiles whose Chebyshev distance to (cx,cy) is <= radius. */
  roadTilesWithin(cx, cy, radius) {
    const out = [];
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (this.isRoad(x, y)) out.push([x, y]);
      }
    }
    return out;
  }

  speedMultiplierAt(x, y) {
    return this.frozen.get(Grid.key(x, y)) ?? 1;
  }

  /**
   * Rebuilds the frozen map from freeze sources [{x,y,radius,slow}].
   * Returns the tiles whose multiplier changed: [{x,y,multiplier}].
   */
  recomputeFrozen(sources) {
    const next = new Map();
    for (const s of sources) {
      const mult = Math.max(0.1, 1 - (1 - s.slow) * this.frostBonus);
      for (const [x, y] of this.roadTilesWithin(s.x, s.y, s.radius)) {
        const k = Grid.key(x, y);
        next.set(k, Math.min(next.get(k) ?? 1, mult));
      }
    }
    const changed = [];
    const keys = new Set([...this.frozen.keys(), ...next.keys()]);
    for (const k of keys) {
      const before = this.frozen.get(k) ?? 1;
      const after = next.get(k) ?? 1;
      if (before !== after) {
        const [x, y] = k.split(',').map(Number);
        changed.push({ x, y, multiplier: after });
      }
    }
    this.frozen = next;
    return changed;
  }

  frozenTiles() {
    return [...this.frozen.entries()].map(([k, multiplier]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y, multiplier };
    });
  }
}
