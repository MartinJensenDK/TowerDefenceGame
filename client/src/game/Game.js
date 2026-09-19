import { Emitter } from './events.js';
import { Grid } from './Grid.js';
import { Enemy } from './Enemy.js';
import { Tower } from './Tower.js';
import { Economy } from './Economy.js';
import { WaveRun, generateEndlessWave, hpMultiplier, waveBonus } from './Wave.js';
import { validateMap } from './validateMap.js';

export const AUTO_WAVE_DELAY = 10;
export const START_LIVES = 20;
export const EARLY_WAVE_BONUS = 0.1;

/** The whole simulation. No rendering, no DOM. */
export class Game extends Emitter {
  constructor({ map, towerDefs, enemyDefs, rng = Math.random }) {
    super();
    validateMap(map, enemyDefs);
    this.map = map;
    this.towerDefs = towerDefs;
    this.enemyDefs = enemyDefs;
    this.rng = rng;
    this.grid = new Grid(map);
    this.economy = new Economy({ gold: map.startGold, lives: START_LIVES });
    this.enemies = [];
    this.towers = [];
    this.activeWaves = [];
    this.wave = 0;
    this.totalWaves = map.waves.length;
    this.endless = false;
    this.state = 'idle';
    this.autoWave = false;
    this.countdown = null;
    this.waveInterval = map.modifiers?.waveInterval ?? null;
    this.waveTimer = null;
    this.time = 0;
    this.pathsWorld = map.paths.map((_, i) => this.grid.pathToWorld(i));
  }

  get isOver() {
    return this.state === 'won' || this.state === 'lost';
  }

  get canStartWave() {
    return !this.isOver && (this.endless || this.wave < this.totalWaves);
  }

  setAutoWave(on) {
    this.autoWave = !!on;
  }

  startNextWave() {
    if (!this.canStartWave) return false;
    const early = this.activeWaves.length > 0;
    this.wave++;
    this.countdown = null;
    const endless = this.wave > this.totalWaves;
    const def = endless
      ? generateEndlessWave(this.wave, this.map.paths.length, this.rng)
      : this.map.waves[this.wave - 1];
    const run = new WaveRun(this.wave, def);
    run.early = early;
    this.activeWaves.push(run);
    this.state = 'running';
    this.waveTimer = this.waveInterval !== null && this.canStartWave ? this.waveInterval : null;
    this.emit('wave:started', { wave: this.wave, early, endless });
    return true;
  }

  startEndless() {
    if (this.state !== 'won') return false;
    this.endless = true;
    this.state = 'idle';
    this.countdown = AUTO_WAVE_DELAY;
    this.emit('endless:started', { wave: this.wave });
    return true;
  }

  update(dt) {
    if (this.isOver) return;
    this.time += dt;

    for (const run of this.activeWaves) {
      for (const s of run.update(dt)) this.#spawn(s, run.number);
    }

    for (const e of this.enemies) {
      if (!e.alive || e.reachedBase) continue;
      e.update(dt, this.grid);
      if (e.reachedBase) {
        const dead = this.economy.loseLives(e.livesCost);
        this.emit('enemy:reachedBase', { enemy: e, livesLost: e.livesCost });
        this.#emitEconomy();
        if (dead) {
          this.#end('lost');
          return;
        }
      }
    }

    for (const t of this.towers) {
      for (const action of t.update(dt, this.enemies)) this.#applyAction(action);
    }

    this.enemies = this.enemies.filter((e) => e.alive && !e.reachedBase);

    for (const run of [...this.activeWaves]) {
      if (run.spawningDone && !this.enemies.some((e) => e.wave === run.number)) this.#endWave(run);
    }

    if (this.waveTimer !== null) {
      if (!this.canStartWave) this.waveTimer = null;
      else {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.startNextWave();
      }
    }

    if (this.state === 'idle' && this.countdown !== null) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = null;
        if (this.autoWave) this.startNextWave();
      }
    }
  }

  towerAt(tx, ty) {
    const id = this.grid.towerIdAt(tx, ty);
    return id === null ? null : (this.towers.find((t) => t.id === id) ?? null);
  }

  buildTower(type, tx, ty) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const def = this.towerDefs[type];
    if (!def) return { ok: false, error: 'unknownTower' };
    if (!this.grid.isBuildable(tx, ty)) return { ok: false, error: 'notBuildable' };
    if (!this.economy.spend(def.levels[0].cost)) return { ok: false, error: 'notEnoughGold' };
    const tower = new Tower({ type, def, tileX: tx, tileY: ty, world: this.grid.tileToWorld(tx, ty) });
    this.towers.push(tower);
    this.grid.occupy(tx, ty, tower.id);
    this.emit('tower:built', { tower });
    this.#emitEconomy();
    if (def.kind === 'freeze') this.#refreeze();
    return { ok: true, tower };
  }

  upgradeTower(id) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const tower = this.towers.find((t) => t.id === id);
    if (!tower) return { ok: false, error: 'noTower' };
    if (!tower.canUpgrade) return { ok: false, error: 'maxLevel' };
    if (!this.economy.spend(tower.upgradeCost)) return { ok: false, error: 'notEnoughGold' };
    tower.upgrade();
    this.emit('tower:upgraded', { tower });
    this.#emitEconomy();
    if (tower.def.kind === 'freeze') this.#refreeze();
    return { ok: true, tower };
  }

  sellTower(id) {
    if (this.isOver) return { ok: false, error: 'gameOver' };
    const tower = this.towers.find((t) => t.id === id);
    if (!tower) return { ok: false, error: 'noTower' };
    const refund = tower.sellRefund;
    this.towers = this.towers.filter((t) => t !== tower);
    this.grid.release(tower.tileX, tower.tileY);
    this.economy.earn({ gold: refund });
    this.emit('tower:sold', { tower, refund });
    this.#emitEconomy();
    if (tower.def.kind === 'freeze') this.#refreeze();
    return { ok: true, refund };
  }

  #spawn(s, wave) {
    const def = this.enemyDefs[s.type];
    const enemy = new Enemy({
      type: s.type,
      def,
      path: this.pathsWorld[s.path],
      hpMultiplier: hpMultiplier(wave),
      wave,
      pathIndex: s.path,
    });
    this.enemies.push(enemy);
    this.emit('enemy:spawned', { enemy });
  }

  #applyAction(a) {
    if (a.type === 'fire') {
      this.emit('tower:fired', { tower: a.tower, target: a.target, projectile: a.tower.def.projectile });
      const target = a.target;
      this.#damage(target, a.damage, a.tower);
      if (a.splashRadius > 0) {
        for (const e of this.enemies) {
          if (e === target || !a.tower.canTarget(e)) continue;
          if (Math.hypot(e.x - target.x, e.z - target.z) <= a.splashRadius) {
            this.#damage(e, Math.round(a.damage * a.splashFactor), a.tower);
          }
        }
      }
    } else if (a.type === 'areaTick') {
      this.emit('tower:fired', { tower: a.tower, target: null, projectile: 'spikes' });
      for (const e of a.targets) this.#damage(e, a.damage, a.tower);
    }
  }

  #damage(enemy, amount, tower) {
    if (!enemy.alive) return;
    const died = enemy.takeDamage(amount);
    this.emit('enemy:hit', { enemy, damage: amount, towerType: tower.type });
    if (died) {
      this.economy.earn({ gold: enemy.gold, score: enemy.score });
      this.emit('enemy:died', { enemy, gold: enemy.gold, score: enemy.score });
      this.#emitEconomy();
    }
  }

  #endWave(run) {
    this.activeWaves = this.activeWaves.filter((r) => r !== run);
    const bonus = waveBonus(run.number);
    const score = run.early ? bonus.score + Math.round(bonus.score * EARLY_WAVE_BONUS) : bonus.score;
    this.economy.earn({ gold: bonus.gold, score });
    this.emit('wave:ended', { wave: run.number, bonusGold: bonus.gold, bonusScore: score, early: run.early });
    this.#emitEconomy();
    if (this.activeWaves.length === 0) {
      if (!this.endless && this.wave >= this.totalWaves) {
        this.#end('won');
      } else {
        this.state = 'idle';
        this.countdown = AUTO_WAVE_DELAY;
      }
    }
  }

  #end(state) {
    this.state = state;
    this.countdown = null;
    this.waveTimer = null;
    this.emit(state === 'won' ? 'game:won' : 'game:lost', { score: this.economy.score, wave: this.wave });
  }

  /** Rebuilds frozen-tile state from every freeze tower and emits what changed, if anything. */
  #refreeze() {
    const sources = this.towers.map((t) => t.freezeSource()).filter(Boolean);
    const changed = this.grid.recomputeFrozen(sources);
    if (changed.length > 0) {
      this.emit('tile:frozenChanged', { tiles: this.grid.frozenTiles(), changed });
    }
  }

  #emitEconomy() {
    this.emit('economy:changed', this.economy.snapshot());
  }
}
