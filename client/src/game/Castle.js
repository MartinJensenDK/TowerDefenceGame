import { Tower } from './Tower.js';

export const CASTLE_UPGRADES = ['barricade', 'archers'];
export const BARRICADE_REGEN_DELAY = 4; // seconds without a hit before the barricade starts mending
export const BARRICADE_REGEN_RATE = 0.03; // share of max hp mended per second
export const BARRICADE_REBUILD_TIME = 20; // seconds after being smashed until it stands again
/** How far in front of the barricade the trolls stop (plus a per-troll queue gap). */
export const BARRICADE_STOP_GAP = 0.7;
/** The barricade stands this far outside the castle footprint, clear of the gatehouse. */
export const BARRICADE_SETBACK = 0.9;

/**
 * A wooden barricade across one road where it enters the castle. Walking trolls stop in front of it
 * and hack at it; once smashed it lets them through until it is rebuilt.
 */
export class Barricade {
  constructor({ pathIndex, distance, x, z, heading }) {
    this.pathIndex = pathIndex;
    this.distance = distance; // travelled distance along the path at which the barricade stands
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.maxHp = 0; // 0 = no barricade bought yet
    this.hp = 0;
    this.standing = false;
    this.sinceHit = Infinity;
    this.rebuildTimer = 0;
  }

  get active() {
    return this.maxHp > 0;
  }

  /** Blocks walkers only while it is bought and standing. */
  get blocking() {
    return this.active && this.standing;
  }

  setMaxHp(maxHp) {
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.standing = maxHp > 0;
    this.rebuildTimer = 0;
  }

  /** Applies damage; returns true when this hit smashed the barricade. */
  hit(amount) {
    if (!this.blocking || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHit = 0;
    if (this.hp === 0) {
      this.standing = false;
      this.rebuildTimer = BARRICADE_REBUILD_TIME;
      return true;
    }
    return false;
  }

  /** Mends itself when left alone; returns true on the tick it is rebuilt. */
  update(dt) {
    if (!this.active) return false;
    this.sinceHit += dt;
    if (!this.standing) {
      this.rebuildTimer -= dt;
      if (this.rebuildTimer <= 0) {
        this.standing = true;
        this.hp = this.maxHp;
        this.sinceHit = Infinity;
        return true;
      }
      return false;
    }
    if (this.hp < this.maxHp && this.sinceHit >= BARRICADE_REGEN_DELAY) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * BARRICADE_REGEN_RATE * dt);
    }
    return false;
  }
}

/**
 * Where a world-space path first steps onto the castle's 3×3 footprint: the point on the footprint
 * edge, the travelled distance to it and the direction of travel there.
 */
export function castleEntry(path, base, tileToWorld) {
  const bw = tileToWorld(base[0], base[1]);
  const half = 1.5 * Math.abs(tileToWorld(1, 0).x - tileToWorld(0, 0).x); // 1.5 tiles
  const inside = (p) => Math.abs(p.x - bw.x) <= half + 1e-6 && Math.abs(p.z - bw.z) <= half + 1e-6;
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (!inside(a) && inside(b)) {
      // roads are axis aligned: find where this leg crosses the footprint edge
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      let t = 0.5;
      if (Math.abs(dx) > Math.abs(dz)) t = (bw.x - Math.sign(dx) * half - a.x) / dx;
      else if (Math.abs(dz) > 0) t = (bw.z - Math.sign(dz) * half - a.z) / dz;
      t = Math.min(1, Math.max(0, t - BARRICADE_SETBACK / Math.max(1e-9, len)));
      return {
        distance: travelled + len * t,
        x: a.x + dx * t,
        z: a.z + dz * t,
        heading: Math.atan2(dx, dz),
      };
    }
    travelled += len;
  }
  const last = path[path.length - 1];
  return { distance: travelled, x: last.x, z: last.z, heading: 0 };
}

/**
 * The player's castle and its upgrades: barricades at every road entry and archers on the walls.
 * Levels are 0 (not bought) to 10. The archers are a hidden Tower of type 'castle' so they reuse
 * the normal targeting and firing; Game feeds its actions through the same pipeline as towers.
 */
export class Castle {
  constructor({ defs = null, map, grid, pathsWorld }) {
    this.defs = defs;
    this.map = map;
    this.levels = { barricade: 0, archers: 0 };
    const tileToWorld = (x, y) => grid.tileToWorld(x, y);
    this.barricades = pathsWorld.map((path, i) => new Barricade({ pathIndex: i, ...castleEntry(path, map.base, tileToWorld) }));
    const [bx, by] = map.base;
    const world = grid.tileToWorld(bx, by);
    this.archerDef = defs?.archers
      ? {
          kind: 'projectile',
          hitsFlying: true,
          hitsGround: true,
          projectile: 'arrow',
          // several archers share one cooldown, so the tower fires count × fireRate arrows per second
          levels: defs.archers.levels.map((l) => ({ ...l, fireRate: l.fireRate * l.count })),
        }
      : null;
    this.archers = this.archerDef ? new Tower({ type: 'castle', def: this.archerDef, tileX: bx, tileY: by, world }) : null;
    this.x = world.x;
    this.z = world.z;
  }

  maxLevel(kind) {
    return this.defs?.[kind]?.levels.length ?? 0;
  }

  level(kind) {
    return this.levels[kind] ?? 0;
  }

  /** Stats of the current level, or null when not bought. */
  stats(kind) {
    const lvl = this.level(kind);
    return lvl > 0 ? this.defs[kind].levels[lvl - 1] : null;
  }

  /** Stats the next upgrade would give, or null at max level. */
  nextStats(kind) {
    return this.canUpgrade(kind) ? this.defs[kind].levels[this.level(kind)] : null;
  }

  canUpgrade(kind) {
    return !!this.defs?.[kind] && this.level(kind) < this.maxLevel(kind);
  }

  upgradeCost(kind) {
    return this.canUpgrade(kind) ? this.defs[kind].levels[this.level(kind)].cost : null;
  }

  upgrade(kind) {
    if (!this.canUpgrade(kind)) return false;
    this.levels[kind]++;
    if (kind === 'barricade') {
      const { hp } = this.stats('barricade');
      for (const b of this.barricades) b.setMaxHp(hp);
    } else if (kind === 'archers') {
      this.archers.level = this.levels.archers - 1;
    }
    return true;
  }

  barricadeFor(pathIndex) {
    return this.barricades[pathIndex] ?? null;
  }

  /** Number of archer trolls to show on the walls. */
  get archerCount() {
    return this.stats('archers')?.count ?? 0;
  }

  /** Advances barricade repair and lets the archers shoot. Returns tower actions plus rebuilt barricades. */
  update(dt, enemies) {
    const rebuilt = this.barricades.filter((b) => b.update(dt));
    const actions = this.levels.archers > 0 ? this.archers.update(dt, enemies) : [];
    return { actions, rebuilt };
  }
}
