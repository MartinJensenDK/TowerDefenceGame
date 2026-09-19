let nextId = 1;

/** A troll walking a world-space waypoint path. Pure data + movement. */
export class Enemy {
  constructor({ type, def, path, hpMultiplier = 1, wave = 0, pathIndex = 0 }) {
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.wave = wave;
    this.pathIndex = pathIndex;
    this.maxHp = Math.round(def.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.baseSpeed = def.speed;
    this.flying = !!def.flying;
    this.gold = def.gold;
    this.score = def.score;
    this.livesCost = def.livesCost;

    this.path = path;
    this.segment = 0;
    this.segProgress = 0;
    this.segLengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
    this.totalLength = this.segLengths.reduce((a, b) => a + b, 0);
    this.traveled = 0;

    this.x = path[0].x;
    this.z = path[0].z;
    this.heading = 0;
    this.speedMultiplier = 1;
    this.alive = true;
    this.reachedBase = false;
    this.#updatePosition();
  }

  get distanceToBase() {
    return this.totalLength - this.traveled;
  }

  update(dt, grid) {
    if (!this.alive || this.reachedBase) return;
    const tile = grid.worldToTile(this.x, this.z);
    this.speedMultiplier = this.flying ? 1 : grid.speedMultiplierAt(tile.x, tile.y);
    let remaining = this.baseSpeed * this.speedMultiplier * dt;
    while (remaining > 0 && this.segment < this.segLengths.length) {
      const segLen = this.segLengths[this.segment];
      const left = segLen - this.segProgress;
      const step = Math.min(left, remaining);
      this.segProgress += step;
      this.traveled += step;
      remaining -= step;
      if (this.segProgress >= segLen - 1e-9) {
        this.segment++;
        this.segProgress = 0;
      }
    }
    this.#updatePosition();
    if (this.segment >= this.segLengths.length) {
      this.reachedBase = true;
      this.traveled = this.totalLength;
    }
  }

  #updatePosition() {
    if (this.segment >= this.segLengths.length) {
      const end = this.path[this.path.length - 1];
      this.x = end.x;
      this.z = end.z;
      return;
    }
    const a = this.path[this.segment];
    const b = this.path[this.segment + 1];
    const len = this.segLengths[this.segment];
    const t = len > 0 ? this.segProgress / len : 1;
    this.x = a.x + (b.x - a.x) * t;
    this.z = a.z + (b.z - a.z) * t;
    this.heading = Math.atan2(b.x - a.x, b.z - a.z);
  }

  /** Applies damage; returns true if this call killed the enemy. */
  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }
}
