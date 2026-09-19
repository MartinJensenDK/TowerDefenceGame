import { t } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';
import { rememberedName } from './Highscores.js';

export function hideDialog(root) {
  root.hidden = true;
  root.innerHTML = '';
}

/** Shown on win or loss: score, name entry + submit, optional endless, back to menu. */
export function showEndDialog(root, { won, score, wave, onSubmit, onEndless, onMenu }) {
  root.innerHTML = `<div class="card dialog-card">
      <h1>${won ? t('end.wonTitle') : t('end.lostTitle')}</h1>
      <p>${t('end.score', { score })}<br>${t('end.wave', { wave })}</p>
      <input data-name maxlength="16" placeholder="${t('end.namePlaceholder')}" value="${escapeHtml(rememberedName())}">
      <div class="status" data-status></div>
      <div class="dialog-actions">
        <button class="btn primary" data-submit>${t('end.submit')}</button>
        ${won ? `<button class="btn" data-endless>${t('end.continueEndless')}</button>` : ''}
        <button class="btn" data-menu>${t('end.backToMenu')}</button>
      </div>
    </div>`;
  root.hidden = false;
  const nameEl = root.querySelector('[data-name]');
  const statusEl = root.querySelector('[data-status]');
  const submitEl = root.querySelector('[data-submit]');
  submitEl.addEventListener('click', async () => {
    const name = nameEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    submitEl.disabled = true;
    nameEl.disabled = true;
    const result = await onSubmit(name);
    statusEl.textContent = result.online ? t('end.submitted', { rank: result.rank }) : t('end.submittedOffline');
  });
  root.querySelector('[data-endless]')?.addEventListener('click', () => onEndless());
  root.querySelector('[data-menu]').addEventListener('click', () => onMenu());
  nameEl.focus();
}

export function showPauseDialog(root, { onResume, onQuit }) {
  root.innerHTML = `<div class="card dialog-card">
      <h1>${t('pause.title')}</h1>
      <div class="dialog-actions">
        <button class="btn primary" data-resume>${t('pause.resume')}</button>
        <button class="btn danger" data-quit>${t('pause.quit')}</button>
      </div>
    </div>`;
  root.hidden = false;
  root.querySelector('[data-resume]').addEventListener('click', () => onResume());
  root.querySelector('[data-quit]').addEventListener('click', () => onQuit());
}
