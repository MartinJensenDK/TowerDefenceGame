import { t } from '../i18n/i18n.js';
import { MAPS, MAP_ORDER, ENEMY_DEFS } from '../data/index.js';
import { validateMap } from '../game/validateMap.js';
import { personalBest, fetchTop, localScores, renderScoresTable } from './Highscores.js';

// the GameHub's "All games" icon (the hub's public/all-games.svg): every link back to the portal uses it
const ALL_GAMES_ICON = '<svg class="all-games-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="8.5" height="8.5" rx="2" fill="#e8942a" stroke="#9a5a14" stroke-width="1.2"/><rect x="13" y="2.5" width="8.5" height="8.5" rx="2" fill="#6aa84f" stroke="#3d6e2a" stroke-width="1.2"/><rect x="2.5" y="13" width="8.5" height="8.5" rx="2" fill="#5b8fc9" stroke="#2f5a8a" stroke-width="1.2"/><rect x="13" y="13" width="8.5" height="8.5" rx="2" fill="#c74b3c" stroke="#8a2a1e" stroke-width="1.2"/></svg>';

/** Main menu: map cards with personal bests, and a per-map highscore view. */
export class Menu {
  constructor(root, { onPlay }) {
    this.root = root;
    this.onPlay = onPlay;
  }

  show() {
    this.#renderMaps();
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  #isAvailable(id) {
    try {
      validateMap(MAPS[id], ENEMY_DEFS);
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  #renderMaps() {
    const cards = MAP_ORDER.map((id) => {
      const ok = this.#isAvailable(id);
      const best = personalBest(id);
      return `<div class="map-card ${ok ? '' : 'unavailable'}" data-theme="${id}">
          <h3>${t(`map.${id}.name`)}</h3>
          <p>${t(`map.${id}.description`)}</p>
          <span class="best">${best === null ? t('menu.noBest') : t('menu.personalBest', { score: best })}</span>
          <div class="actions">
            <button class="btn primary" data-play="${id}" ${ok ? '' : 'disabled'}>${ok ? t('menu.play') : t('menu.unavailable')}</button>
            <button class="btn" data-scores="${id}">${t('menu.highscores')}</button>
          </div>
        </div>`;
    }).join('');
    // behind the GameHub (built for a sub-path like /troll-towers/) the site's front page lists every game
    const allGames = import.meta.env.BASE_URL !== '/' ? `<a class="btn small all-games" href="/">${ALL_GAMES_ICON}<span>${t('menu.allGames')}</span></a>` : '';
    this.root.innerHTML = `<div class="card">
        ${allGames}
        <h1>${t('app.title')}</h1>
        <p class="subtitle">${t('app.subtitle')}</p>
        <h2>${t('menu.chooseMap')}</h2>
        <div class="map-grid">${cards}</div>
        <p class="howto">${t('menu.howTo')}</p>
      </div>`;
    for (const b of this.root.querySelectorAll('[data-play]')) b.addEventListener('click', () => this.onPlay(b.dataset.play));
    for (const b of this.root.querySelectorAll('[data-scores]')) b.addEventListener('click', () => this.#renderScores(b.dataset.scores));
  }

  async #renderScores(id) {
    this.root.innerHTML = `<div class="card">
        <div class="panel-header">
          <h2>${t('scores.title', { map: t(`map.${id}.name`) })}</h2>
          <button class="btn small" data-back>${t('menu.back')}</button>
        </div>
        <div data-list>${t('scores.loading')}</div>
      </div>`;
    this.root.querySelector('[data-back]').addEventListener('click', () => this.#renderMaps());
    const list = this.root.querySelector('[data-list]');
    try {
      const rows = await fetchTop(id, 10);
      list.innerHTML = renderScoresTable(rows);
    } catch {
      list.innerHTML = `<span class="offline-badge">${t('scores.offline')}</span>${renderScoresTable(localScores(id))}`;
    }
  }
}
