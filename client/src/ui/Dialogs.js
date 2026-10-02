import { t } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';
import { loginUrl, rememberedName } from './Highscores.js';

export function hideDialog(root) {
  root.hidden = true;
  root.innerHTML = '';
}

/**
 * Shown on win or loss: score, submit, optional endless, back to menu. A logged-in player (account = { displayName })
 * scores under their display name; a guest types a name and is offered the hub's login.
 */
export function showEndDialog(root, { won, score, wave, account = null, onSubmit, onEndless, onMenu }) {
  const named = Boolean(account?.displayName);
  const who = named
    ? `<p class="muted">${escapeHtml(t('end.savingAs', { name: account.displayName }))}</p>`
    : `<input data-name maxlength="16" placeholder="${t('end.namePlaceholder')}" value="${escapeHtml(rememberedName())}">
       <p class="muted"><a href="${escapeHtml(account ? `/login?mode=name&next=${encodeURIComponent(import.meta.env.BASE_URL)}` : loginUrl())}" target="_blank" rel="noopener">${t(account ? 'end.chooseName' : 'end.loginHint')}</a></p>`;
  root.innerHTML = `<div class="card dialog-card">
      <h1>${won ? t('end.wonTitle') : t('end.lostTitle')}</h1>
      <p>${t('end.score', { score })}<br>${t('end.wave', { wave })}</p>
      ${who}
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
    const name = named ? account.displayName : nameEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    submitEl.disabled = true;
    if (nameEl) nameEl.disabled = true;
    const result = await onSubmit(name);
    statusEl.textContent = result.online ? t('end.submitted', { rank: result.rank }) : t('end.submittedOffline');
  });
  root.querySelector('[data-endless]')?.addEventListener('click', () => onEndless());
  root.querySelector('[data-menu]').addEventListener('click', () => onMenu());
  (nameEl ?? submitEl).focus();
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
