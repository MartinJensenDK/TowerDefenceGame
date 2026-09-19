import { Game } from '../game/Game.js';
import { GameSession } from '../render/GameSession.js';
import { MAPS, TOWER_DEFS, ENEMY_DEFS, TOWER_ORDER } from '../data/index.js';
import { t } from '../i18n/i18n.js';
import { Hud } from './Hud.js';
import { BuildPanel } from './BuildPanel.js';
import { InputController } from './InputController.js';

/** One playthrough: game + session + HUD + build panel + input. */
export class GameScreen {
  constructor({ mapId, sceneManager, models, onEnd, onQuit }) {
    this.sceneManager = sceneManager;
    this.onEnd = onEnd;
    this.onQuit = onQuit;
    this.game = new Game({ map: MAPS[mapId], towerDefs: TOWER_DEFS, enemyDefs: ENEMY_DEFS });
    this.session = new GameSession({ game: this.game, sceneManager, models });
    this.hud = new Hud(document.getElementById('hud'));
    this.panel = new BuildPanel(document.getElementById('build-panel'), { towerDefs: TOWER_DEFS, towerOrder: TOWER_ORDER });
    this.speed = 1;
    this.paused = false;
    this.selectedTile = null;
    this.selectedTower = null;
    this.previewType = null;

    this.input = new InputController(sceneManager.canvas, {
      pickTile: (x, y) => this.session.pickTile(x, y),
      onTileClick: (tile) => this.#onTileClick(tile),
      onTileHover: () => {},
      onCancel: () => this.closePanel(),
    });

    this.hud.onNextWave = () => this.game.startNextWave();
    this.hud.onAutoToggle = () => this.game.setAutoWave(!this.game.autoWave);
    this.hud.onSpeedToggle = () => {
      this.speed = this.speed === 1 ? 2 : 1;
      this.session.speed = this.speed;
    };
    this.hud.onMenu = () => this.onQuit?.();

    this.panel.onPreview = (type) => {
      this.previewType = type;
      if (type && this.selectedTile) this.session.showGhost(type, this.selectedTile);
      else this.session.hideGhost();
    };
    this.panel.onBuild = (type) => {
      if (!this.selectedTile) return;
      const r = this.game.buildTower(type, this.selectedTile.x, this.selectedTile.y);
      if (r.ok) this.closePanel();
      else if (r.error === 'notEnoughGold') this.hud.toast(t('build.tooExpensive'));
    };
    this.panel.onUpgrade = () => {
      if (!this.selectedTower) return;
      const r = this.game.upgradeTower(this.selectedTower.id);
      if (r.ok) this.panel.showTower(this.selectedTower, this.game.economy.gold);
      else if (r.error === 'notEnoughGold') this.hud.toast(t('build.tooExpensive'));
    };
    this.panel.onSell = () => {
      if (!this.selectedTower) return;
      this.game.sellTower(this.selectedTower.id);
      this.closePanel();
    };
    this.panel.onClose = () => this.closePanel();

    this.unsubscribe = [
      this.game.on('economy:changed', () => this.panel.refresh(this.game.economy.gold)),
      this.game.on('wave:started', ({ wave }) => this.hud.toast(t('hud.waveIncoming', { wave }))),
      this.game.on('wave:ended', ({ wave, bonusGold, bonusScore }) => this.hud.toast(t('hud.waveCleared', { wave, gold: bonusGold, score: bonusScore }))),
      this.game.on('game:won', (p) => this.onEnd?.({ won: true, ...p })),
      this.game.on('game:lost', (p) => this.onEnd?.({ won: false, ...p })),
    ];

    sceneManager.onFrame = (dt) => {
      this.session.update(this.paused ? 0 : dt);
      this.hud.render(this.game, this.speed);
    };
    this.hud.render(this.game, this.speed);
    this.hud.show();
  }

  #onTileClick(tile) {
    if (!tile) return this.closePanel();
    const tower = this.game.towerAt(tile.x, tile.y);
    if (tower) {
      this.selectedTower = tower;
      this.selectedTile = null;
      this.session.hideGhost();
      this.panel.showTower(tower, this.game.economy.gold);
      return;
    }
    if (this.game.grid.isBuildable(tile.x, tile.y)) {
      this.selectedTile = tile;
      this.selectedTower = null;
      this.panel.showBuild(tile, this.game.economy.gold);
      if (this.previewType) this.session.showGhost(this.previewType, tile);
      return;
    }
    this.closePanel();
  }

  closePanel() {
    this.panel.hide();
    this.session.hideGhost();
    this.selectedTile = null;
    this.selectedTower = null;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  dispose() {
    for (const off of this.unsubscribe) off();
    this.sceneManager.onFrame = null;
    this.input.dispose();
    this.closePanel();
    this.hud.hide();
    this.session.dispose();
  }
}
