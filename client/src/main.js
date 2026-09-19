import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameScreen } from './ui/GameScreen.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = message;
  el.hidden = false;
}

async function boot() {
  await loadLanguage('en');
  const canvas = document.getElementById('game');
  let sceneManager;
  try {
    sceneManager = new SceneManager(canvas);
  } catch (err) {
    console.error(err);
    showFatal(t('app.webglMissing'));
    return;
  }
  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);
  sceneManager.start();

  const mapId = new URLSearchParams(location.search).get('map') ?? 'green';
  const screen = new GameScreen({
    mapId,
    sceneManager,
    models,
    onEnd: (result) => console.log('game over', result),
    onQuit: () => console.log('quit requested'),
  });
  if (import.meta.env.DEV) window.__tt = { game: screen.game, session: screen.session, screen };
}

boot();
