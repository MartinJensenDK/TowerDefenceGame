let nextId = 1;

export const SELL_FACTOR = 0.7;

/** A placed tower. Handles targeting, cooldowns and level math. Damage is applied by Game. */
export class Tower {
  constructor({ type, def, tileX, tileY, world }) {
    this.id = nextId++;
    this.type = type;
    this.def = def;
    this.tileX = tileX;
    this.tileY = tileY;
    this.x = world.x;
    this.z = world.z;
    this.level = 0;
    this.invested = def.levels[0].cost;
    this.cooldown = 0;
    this.facing = 0;
    this.targetId = null;
  }

  get stats() {
    return this.def.levels[this.level];
  }

  get maxLevel() {
    return this.def.levels.length - 1;
  }

  get canUpgrade() {
    return this.level < this.maxLevel;
  }

  get upgradeCost() {
    return this.canUpgrade ? this.def.levels[this.level + 1].cost : null;
  }

  get sellRefund() {
    return Math.floor(this.invested * SELL_FACTOR);
  }

  upgrade() {
    if (!this.canUpgrade) return false;
    this.level++;
    this.invested += this.stats.cost;
    return true;
  }

  distanceTo(enemy) {
    return Math.hypot(enemy.x - this.x, enemy.z - this.z);
  }

  canTarget(enemy) {
    if (!enemy.alive || enemy.reachedBase) return false;
    return enemy.flying ? !!this.def.hitsFlying : this.def.hitsGround !== false;
  }

  inRange(enemy) {
    return this.distanceTo(enemy) <= this.stats.range;
  }

  enemiesInRange(enemies) {
    return enemies.filter((e) => this.canTarget(e) && this.inRange(e));
  }

  /** "First" targeting: the enemy in range that is closest to the base. */
  pickTarget(enemies) {
    let best = null;
    for (const e of this.enemiesInRange(enemies)) {
      if (!best || e.distanceToBase < best.distanceToBase) best = e;
    }
    return best;
  }

  update(dt, enemies) {
    const actions = [];
    this.cooldown = Math.max(0, this.cooldown - dt);
    const kind = this.def.kind;
    if (kind === 'projectile') {
      const target = this.pickTarget(enemies);
      this.targetId = target?.id ?? null;
      if (target) {
        this.facing = Math.atan2(target.x - this.x, target.z - this.z);
        if (this.cooldown === 0) {
          this.cooldown = 1 / this.stats.fireRate;
          actions.push({
            type: 'fire',
            tower: this,
            target,
            damage: this.stats.damage,
            splashRadius: this.stats.splashRadius ?? 0,
            splashFactor: this.stats.splashFactor ?? 0,
          });
        }
      }
    } else if (kind === 'area') {
      if (this.cooldown === 0) {
        const targets = this.enemiesInRange(enemies);
        if (targets.length > 0) {
          this.cooldown = this.stats.tickInterval;
          actions.push({ type: 'areaTick', tower: this, targets, damage: this.stats.damage });
        }
      }
    }
    return actions;
  }

  freezeSource() {
    if (this.def.kind !== 'freeze') return null;
    return { x: this.tileX, y: this.tileY, radius: this.stats.freezeRadius, slow: this.stats.slow };
  }
}
