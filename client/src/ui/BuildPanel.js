import { t } from '../i18n/i18n.js';

const STAT_KEYS = ['damage', 'fireRate', 'range', 'tickInterval', 'freezeRadius', 'slow'];

function formatStat(key, value) {
  if (key === 'slow') return `${Math.round((1 - value) * 100)}%`;
  if (key === 'tickInterval') return `${value}s`;
  return String(value);
}

/** Side panel: pick a tower to build on a tile, or upgrade / sell an existing tower. */
export class BuildPanel {
  constructor(root, { towerDefs, towerOrder }) {
    this.root = root;
    this.towerDefs = towerDefs;
    this.towerOrder = towerOrder;
    this.onPreview = null;
    this.onBuild = null;
    this.onUpgrade = null;
    this.onSell = null;
    this.onClose = null;
    this.target = null; // { kind:'build', tile } | { kind:'tower', tower }
  }

  get visible() {
    return !this.root.hidden;
  }

  showBuild(tile, gold) {
    this.target = { kind: 'build', tile };
    this.#renderBuild(gold);
    this.root.hidden = false;
  }

  showTower(tower, gold) {
    this.target = { kind: 'tower', tower };
    this.#renderTower(gold);
    this.root.hidden = false;
  }

  refresh(gold) {
    if (!this.visible || !this.target) return;
    if (this.target.kind === 'build') this.#renderBuild(gold);
    else this.#renderTower(gold);
  }

  hide() {
    this.root.hidden = true;
    this.target = null;
  }

  #header(title) {
    return `<div class="panel-header"><h2>${title}</h2><button class="btn small" data-action="close">${t('build.close')}</button></div>`;
  }

  #renderBuild(gold) {
    const { tile } = this.target;
    const items = this.towerOrder
      .map((type) => {
        const cost = this.towerDefs[type].levels[0].cost;
        const ok = gold >= cost;
        return `<button class="tower-choice ${ok ? '' : 'too-expensive'}" data-type="${type}" ${ok ? '' : 'disabled'}>
            <span class="tower-name">${t(`tower.${type}.name`)}</span>
            <span class="tower-blurb">${t(`tower.${type}.blurb`)}</span>
            <span class="tower-cost">${t('build.cost', { cost })}</span>
          </button>`;
      })
      .join('');
    this.root.innerHTML = `${this.#header(t('build.title', { x: tile.x, y: tile.y }))}<div class="tower-list">${items}</div>`;
    this.#bindCommon();
    for (const btn of this.root.querySelectorAll('.tower-choice')) {
      btn.addEventListener('mouseenter', () => this.onPreview?.(btn.dataset.type));
      btn.addEventListener('mouseleave', () => this.onPreview?.(null));
      btn.addEventListener('click', () => this.onBuild?.(btn.dataset.type));
    }
  }

  #renderTower(gold) {
    const { tower } = this.target;
    const stats = STAT_KEYS.filter((k) => k in tower.stats)
      .map((k) => `<li><span>${t(`build.stat.${k}`)}</span><strong>${formatStat(k, tower.stats[k])}</strong></li>`)
      .join('');
    const canUpgrade = tower.canUpgrade;
    const affordable = canUpgrade && gold >= tower.upgradeCost;
    this.root.innerHTML = `${this.#header(t('build.towerTitle', { name: t(`tower.${tower.type}.name`), level: tower.level + 1 }))}
      <p class="tower-blurb">${t(`tower.${tower.type}.blurb`)}</p>
      <ul class="stats">${stats}</ul>
      <div class="panel-actions">
        <button class="btn primary" data-action="upgrade" ${affordable ? '' : 'disabled'}>${canUpgrade ? t('build.upgrade', { cost: tower.upgradeCost }) : t('build.maxLevel')}</button>
        <button class="btn danger" data-action="sell">${t('build.sell', { refund: tower.sellRefund })}</button>
      </div>`;
    this.#bindCommon();
    this.root.querySelector('[data-action="upgrade"]').addEventListener('click', () => this.onUpgrade?.());
    this.root.querySelector('[data-action="sell"]').addEventListener('click', () => this.onSell?.());
  }

  #bindCommon() {
    this.root.querySelector('[data-action="close"]').addEventListener('click', () => this.onClose?.());
  }
}
