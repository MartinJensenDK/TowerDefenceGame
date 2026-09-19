import { t } from '../i18n/i18n.js';

/** Top bar: gold / score / lives / wave and the wave, auto, speed and menu buttons. */
export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-bar">
        <div class="stat"><span class="label">${t('hud.gold')}</span><span class="value" data-ref="gold">0</span></div>
        <div class="stat"><span class="label">${t('hud.score')}</span><span class="value" data-ref="score">0</span></div>
        <div class="stat"><span class="label">${t('hud.lives')}</span><span class="value" data-ref="lives">0</span></div>
        <div class="stat wave" data-ref="wave"></div>
        <button class="btn primary" data-ref="next"></button>
        <button class="btn toggle" data-ref="auto" aria-pressed="false">${t('hud.auto')}</button>
        <button class="btn" data-ref="speed"></button>
        <button class="btn" data-ref="menu">${t('hud.menu')}</button>
      </div>
      <div class="toast" data-ref="toast" hidden></div>`;
    this.refs = Object.fromEntries([...root.querySelectorAll('[data-ref]')].map((el) => [el.dataset.ref, el]));
    this.onNextWave = null;
    this.onAutoToggle = null;
    this.onSpeedToggle = null;
    this.onMenu = null;
    this.refs.next.addEventListener('click', () => this.onNextWave?.());
    this.refs.auto.addEventListener('click', () => this.onAutoToggle?.());
    this.refs.speed.addEventListener('click', () => this.onSpeedToggle?.());
    this.refs.menu.addEventListener('click', () => this.onMenu?.());
    this.last = {};
    this.toastTimer = null;
  }

  #set(ref, text) {
    if (this.last[ref] === text) return;
    this.last[ref] = text;
    this.refs[ref].textContent = text;
  }

  render(game, speed) {
    const { gold, score, lives } = game.economy;
    this.#set('gold', String(gold));
    this.#set('score', String(score));
    this.#set('lives', String(lives));
    const endless = game.endless || game.wave > game.totalWaves;
    this.#set('wave', endless ? t('hud.waveEndless', { wave: game.wave }) : t('hud.wave', { wave: game.wave, total: game.totalWaves }));

    let nextLabel;
    if (game.state === 'running') nextLabel = t('hud.callEarly');
    else if (game.countdown !== null && game.autoWave) nextLabel = t('hud.nextWaveIn', { seconds: Math.ceil(game.countdown) });
    else nextLabel = t('hud.nextWave');
    this.#set('next', nextLabel);
    this.refs.next.disabled = !game.canStartWave;
    this.refs.auto.setAttribute('aria-pressed', String(game.autoWave));
    this.#set('speed', t('hud.speed', { speed }));
  }

  toast(text) {
    const el = this.refs.toast;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
