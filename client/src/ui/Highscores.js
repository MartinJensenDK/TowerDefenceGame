import { t } from '../i18n/i18n.js';
import { escapeHtml } from './html.js';

const PENDING_KEY = 'tt.pendingScores';
const BEST_PREFIX = 'tt.best.';
const NAME_KEY = 'tt.name';
const API = `${import.meta.env.BASE_URL}api/highscores`; // BASE_URL is '/' locally and the sub-path in a BASE_PATH build

function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

async function post(entry) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
  return res.json();
}

export async function fetchTop(map, limit = 10) {
  const res = await fetch(`${API}?map=${encodeURIComponent(map)}&limit=${limit}`);
  if (!res.ok) throw new Error(`highscores failed: ${res.status}`);
  return res.json();
}

/** Submits a score; on failure queues it locally for a later flush. */
export async function submitScore(entry) {
  recordBest(entry.map, entry.score);
  rememberName(entry.name);
  try {
    const { rank } = await post(entry);
    return { online: true, rank };
  } catch (err) {
    console.warn('[highscores] could not submit, queued locally', err?.message ?? err);
    writeJson(PENDING_KEY, [...getPending(), entry]);
    return { online: false };
  }
}

export function getPending() {
  const list = readJson(PENDING_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** Retries queued submissions. Returns how many were sent. */
export async function flushPending() {
  const pending = getPending();
  if (pending.length === 0) return 0;
  const remaining = [];
  let sent = 0;
  for (const entry of pending) {
    try {
      await post(entry);
      sent++;
    } catch {
      remaining.push(entry);
    }
  }
  writeJson(PENDING_KEY, remaining);
  return sent;
}

export function personalBest(map) {
  const v = readJson(BEST_PREFIX + map, null);
  return typeof v === 'number' ? v : null;
}

export function recordBest(map, score) {
  const best = personalBest(map);
  if (best === null || score > best) writeJson(BEST_PREFIX + map, score);
}

export function rememberName(name) {
  writeJson(NAME_KEY, name);
}

export function rememberedName() {
  const v = readJson(NAME_KEY, '');
  return typeof v === 'string' ? v : '';
}

/** Scores known locally (queued submissions) for a map, best first. */
export function localScores(map) {
  return getPending()
    .filter((e) => e.map === map)
    .sort((a, b) => b.score - a.score);
}

export function renderScoresTable(rows) {
  if (!rows.length) return `<p>${t('scores.empty')}</p>`;
  const body = rows
    .map(
      (r, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(r.score)}</td><td class="num">${escapeHtml(r.wave)}</td></tr>`,
    )
    .join('');
  return `<table class="scores"><thead><tr><th class="num">#</th><th>${t('scores.name')}</th><th class="num">${t('scores.score')}</th><th class="num">${t('scores.wave')}</th></tr></thead><tbody>${body}</tbody></table>`;
}
