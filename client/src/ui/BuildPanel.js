import { t } from '../i18n/i18n.js';
import { TARGETING_MODES } from '../game/Tower.js';
import { levelColor } from '../data/levelColors.js';
import { CASTLE_UPGRADES } from '../game/Castle.js';

const CASTLE_STAT_KEYS = ['hp', 'count', 'damage', 'fireRate', 'range'];

const STAT_KEYS = ['damage', 'fireRate', 'range', 'tickInterval', 'freezeRadius', 'slow'];

function formatStat(key, value) {
  if (key === 'slow') return t('unit.percent', { value: Math.round((1 - value) * 100) });
  if (key === 'tickInterval') return t('unit.seconds', { value });
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
    this.onTargeting = null;
    this.onCastleUpgrade = null;
    this.onClose = null;
    this.target = null; // { kind:'build', tile } | { kind:'tower', tower } | { kind:'castle', castle }
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

  showCastle(castle, gold) {
    this.target = { kind: 'castle', castle };
    this.#renderCastle(gold);
    this.root.hidden = false;
  }

  refresh(gold) {
    if (!this.visible || !this.target) return;
    if (this.target.kind === 'build') this.#refreshBuild(gold);
    else if (this.target.kind === 'castle') this.#refreshCastle(gold);
    else this.#refreshTower(gold);
  }

  #castleButtonLabel(castle, kind) {
    if (!castle.canUpgrade(kind)) return t('castle.maxLevel');
    return t(castle.level(kind) === 0 ? 'castle.buy' : 'castle.upgrade', { cost: castle.upgradeCost(kind) });
  }

  #refreshCastle(gold) {
    const { castle } = this.target;
    for (const btn of this.root.querySelectorAll('[data-castle]')) {
      const kind = btn.dataset.castle;
      const can = castle.canUpgrade(kind);
      btn.disabled = !can || gold < castle.upgradeCost(kind);
      btn.textContent = this.#castleButtonLabel(castle, kind);
    }
  }

  #renderCastle(gold) {
    const { castle } = this.target;
    const rows = CASTLE_UPGRADES.map((kind) => {
      const level = castle.level(kind);
      const stats = castle.stats(kind);
      const next = castle.nextStats(kind);
      const statList = CASTLE_STAT_KEYS.filter((k) => (stats && k in stats) || (next && k in next))
        .map((k) => {
          const now = stats ? formatStat(k, stats[k]) : '–';
          const then = next && next[k] !== stats?.[k] ? `<em>→ ${formatStat(k, next[k])}</em>` : '';
          return `<li><span>${t(`castle.stat.${k}`)}</span><strong>${now} ${then}</strong></li>`;
        })
        .join('');
      const can = castle.canUpgrade(kind);
      const affordable = can && gold >= castle.upgradeCost(kind);
      return `<section class="castle-upgrade" data-kind="${kind}">
          <h3><span class="level-swatch" style="background:${levelColor(Math.max(0, level - 1))}; visibility:${level ? 'visible' : 'hidden'}"></span>${t(`castle.${kind}.name`)} <span class="level">${t('castle.level', { level, max: castle.maxLevel(kind) })}</span></h3>
          <p class="tower-blurb">${t(`castle.${kind}.blurb`)}</p>
          <ul class="stats">${statList}</ul>
          <button class="btn primary" data-castle="${kind}" ${affordable ? '' : 'disabled'}>${this.#castleButtonLabel(castle, kind)}</button>
        </section>`;
    }).join('');
    this.root.innerHTML = `${this.#header(t('castle.title'))}${rows}`;
    this.#bindCommon();
    for (const btn of this.root.querySelectorAll('[data-castle]')) {
      btn.addEventListener('click', () => this.onCastleUpgrade?.(btn.dataset.castle));
    }
  }

  #refreshBuild(gold) {
    for (const btn of this.root.querySelectorAll('.tower-choice')) {
      const cost = this.towerDefs[btn.dataset.type].levels[0].cost;
      const ok = gold >= cost;
      btn.disabled = !ok;
      btn.classList.toggle('too-expensive', !ok);
    }
  }

  #refreshTower(gold) {
    const { tower } = this.target;
    const canUpgrade = tower.canUpgrade;
    const affordable = canUpgrade && gold >= tower.upgradeCost;
    const upgradeBtn = this.root.querySelector('[data-action="upgrade"]');
    upgradeBtn.disabled = !affordable;
    upgradeBtn.textContent = canUpgrade ? t('build.upgrade', { cost: tower.upgradeCost }) : t('build.maxLevel');
    this.root.querySelector('[data-action="sell"]').textContent = t('build.sell', { refund: tower.sellRefund });
  }

  hide() {
    this.root.hidden = true;
    this.target = null;
  }

  #header(title, swatch = null) {
    const dot = swatch ? `<span class="level-swatch" style="background:${swatch}" title="${t('build.levelColor')}"></span>` : '';
    return `<div class="panel-header"><h2>${dot}${title}</h2><button class="btn small" data-action="close">${t('build.close')}</button></div>`;
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
    this.root.innerHTML = `${this.#header(t('build.towerTitle', { name: t(`tower.${tower.type}.name`), level: tower.level + 1 }), levelColor(tower.level))}
      <p class="tower-blurb">${t(`tower.${tower.type}.blurb`)}</p>
      <ul class="stats">${stats}</ul>
      ${tower.def.kind === 'projectile' ? this.#targetingRow(tower) : ''}
      <div class="panel-actions">
        <button class="btn primary" data-action="upgrade" ${affordable ? '' : 'disabled'}>${canUpgrade ? t('build.upgrade', { cost: tower.upgradeCost }) : t('build.maxLevel')}</button>
        <button class="btn danger" data-action="sell">${t('build.sell', { refund: tower.sellRefund })}</button>
      </div>`;
    this.#bindCommon();
    this.root.querySelector('[data-action="upgrade"]').addEventListener('click', () => this.onUpgrade?.());
    this.root.querySelector('[data-action="sell"]').addEventListener('click', () => this.onSell?.());
    for (const btn of this.root.querySelectorAll('[data-targeting]')) {
      btn.addEventListener('click', () => {
        this.onTargeting?.(btn.dataset.targeting);
        this.#refreshTargeting();
      });
    }
  }

  #targetingRow(tower) {
    const buttons = TARGETING_MODES.map(
      (mode) => `<button class="btn small toggle" data-targeting="${mode}" aria-pressed="${tower.targeting === mode}">${t(`build.targeting.${mode}`)}</button>`,
    ).join('');
    return `<div class="targeting"><span class="label">${t('build.targeting.label')}</span><div class="segmented">${buttons}</div></div>`;
  }

  #refreshTargeting() {
    const { tower } = this.target ?? {};
    if (!tower) return;
    for (const btn of this.root.querySelectorAll('[data-targeting]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.targeting === tower.targeting));
    }
  }

  #bindCommon() {
    this.root.querySelector('[data-action="close"]').addEventListener('click', () => this.onClose?.());
  }
}
