import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameSession } from './render/GameSession.js';
import { Game } from './game/Game.js';
import { MAPS, TOWER_DEFS, ENEMY_DEFS } from './data/index.js';

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

  const mapId = new URLSearchParams(location.search).get('map') ?? 'green';
  const game = new Game({ map: MAPS[mapId] ?? MAPS.green, towerDefs: TOWER_DEFS, enemyDefs: ENEMY_DEFS });
  const session = new GameSession({ game, sceneManager, models });
  sceneManager.onFrame = (dt) => session.update(dt);
  sceneManager.start();
  if (import.meta.env.DEV) window.__tt = { game, session };
}

boot();
