import * as THREE from 'three';
import { MapRenderer } from './MapRenderer.js';
import { CameraRig } from './CameraRig.js';
import { Effects } from './Effects.js';
import { PathPreview } from './PathPreview.js';
import { TileHighlight } from './TileHighlight.js';
import { RangeRing, towerReach } from './RangeRing.js';
import { EnemyView } from './EnemyView.js';
import { TowerView, makeGhost } from './TowerView.js';
import { TILE_TOP } from './SceneManager.js';

/** Binds one Game to the Three.js scene: creates views for events and advances everything per frame. */
export class GameSession {
  constructor({ game, sceneManager, models }) {
    this.game = game;
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.models = models;
    this.speed = 1;

    this.mapRenderer = new MapRenderer({ scene: this.scene, map: game.map, grid: game.grid, models });
    sceneManager.setTheme(this.mapRenderer.theme, this.mapRenderer.extent);
    sceneManager.focusSun(this.mapRenderer.centerX, this.mapRenderer.centerZ, this.mapRenderer.extent);
    this.cameraRig = new CameraRig(sceneManager.camera, sceneManager.canvas, {
      centerX: this.mapRenderer.centerX,
      centerZ: this.mapRenderer.centerZ,
      extent: this.mapRenderer.extent,
    });
    this.effects = new Effects(this.scene);
    this.pathPreview = new PathPreview({ scene: this.scene, paths: game.map.paths.map((_, i) => game.grid.pathToWorld(i)) });
    this.pathPreview.setVisible(game.wave === 0);
    this.tileHighlight = new TileHighlight(this.scene);
    this.rangeRing = new RangeRing(this.scene);
    this.enemyViews = new Map();
    this.towerViews = new Map();
    this.dyingViews = [];
    this.ghost = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.tmp = new THREE.Vector3();

    this.unsubscribe = [
      game.on('wave:started', () => this.pathPreview.setVisible(false)),
      game.on('enemy:spawned', ({ enemy }) => this.enemyViews.set(enemy.id, new EnemyView(enemy, models, this.scene))),
      game.on('enemy:hit', ({ enemy }) => this.enemyViews.get(enemy.id)?.flash()),
      game.on('enemy:died', ({ enemy, gold }) => {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        view.startDeath();
        this.dyingViews.push(view);
        this.effects.deathBurst(view.worldPosition(this.tmp));
        this.effects.hitSprite(view.worldPosition(this.tmp), `+${gold}`, '#ffe680');
      }),
      game.on('enemy:reachedBase', ({ enemy }) => {
        const view = this.enemyViews.get(enemy.id);
        if (!view) return;
        this.enemyViews.delete(enemy.id);
        this.effects.hitSprite(view.worldPosition(this.tmp), 'OUCH!', '#ff6b6b');
        view.dispose();
      }),
      game.on('tower:built', ({ tower }) => {
        this.towerViews.set(tower.id, new TowerView(tower, models, this.scene));
        this.hideGhost();
      }),
      game.on('tower:upgraded', ({ tower }) => {
        const view = this.towerViews.get(tower.id);
        view?.setLevel(tower.level);
        this.effects.hitSprite(this.tmp.set(tower.x, TILE_TOP + 2, tower.z), 'LEVEL UP!', '#9be7ff');
      }),
      game.on('tower:sold', ({ tower }) => {
        this.towerViews.get(tower.id)?.dispose();
        this.towerViews.delete(tower.id);
      }),
      game.on('tower:fired', ({ tower, target, projectile }) => {
        const view = this.towerViews.get(tower.id);
        if (!view) return;
        view.playFire();
        if (projectile === 'spikes') {
          this.effects.spikeBurst({ center: this.tmp.set(tower.x, TILE_TOP + 0.8, tower.z), range: tower.stats.range });
        } else if (target) {
          this.effects.spawnProjectile({ from: view.muzzleWorldPosition(new THREE.Vector3()), target, kind: projectile });
        }
      }),
      game.on('tile:frozenChanged', ({ tiles }) => this.mapRenderer.setFrozen(tiles)),
    ];
    this.mapRenderer.setFrozen(game.grid.frozenTiles());
  }

  update(dt) {
    this.game.update(dt * this.speed);
    for (const view of this.enemyViews.values()) view.update(dt * this.speed);
    this.dyingViews = this.dyingViews.filter((view) => {
      const done = view.update(dt * this.speed);
      if (done) view.dispose();
      return !done;
    });
    for (const view of this.towerViews.values()) view.update(dt * this.speed);
    this.effects.update(dt * this.speed);
    this.mapRenderer.update(dt);
    this.pathPreview.update(dt);
    this.tileHighlight.update(dt);
    this.rangeRing.update(dt);
    this.cameraRig.update();
  }

  pickTile(clientX, clientY) {
    const rect = this.sceneManager.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.sceneManager.camera);
    return this.mapRenderer.pickTile(this.raycaster);
  }

  showGhost(type, tile) {
    if (!this.ghost || this.ghost.type !== type) {
      this.hideGhost();
      this.ghost = { type, ...makeGhost(this.models, type, this.game.towerDefs[type]) };
      this.scene.add(this.ghost.root);
    }
    const w = this.game.grid.tileToWorld(tile.x, tile.y);
    this.ghost.root.position.set(w.x, TILE_TOP, w.z);
    const affordable = this.game.economy.canAfford(this.game.towerDefs[type].levels[0].cost);
    this.ghost.setOk(this.game.grid.isBuildable(tile.x, tile.y) && affordable);
  }

  /** Marks the tile the player selected (to build on, or holding the selected tower) with a blue frame. */
  highlightTile(tile) {
    const w = this.game.grid.tileToWorld(tile.x, tile.y);
    this.tileHighlight.show(w.x, w.z);
  }

  clearHighlight() {
    this.tileHighlight.hide();
  }

  /** Shows how far `tower` reaches at its current level. */
  showRange(tower) {
    this.rangeRing.show(tower.x, tower.z, towerReach(tower.def, tower.stats));
  }

  hideRange() {
    this.rangeRing.hide();
  }

  hideGhost() {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.root);
    this.ghost.dispose();
    this.ghost = null;
  }

  dispose() {
    for (const off of this.unsubscribe) off();
    this.hideGhost();
    this.tileHighlight.dispose();
    this.rangeRing.dispose();
    for (const v of this.enemyViews.values()) v.dispose();
    for (const v of this.dyingViews) v.dispose();
    for (const v of this.towerViews.values()) v.dispose();
    this.enemyViews.clear();
    this.towerViews.clear();
    this.dyingViews = [];
    this.effects.dispose();
    this.pathPreview.dispose();
    this.mapRenderer.dispose();
    this.cameraRig.dispose();
  }
}
