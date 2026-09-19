import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { GameScreen } from './ui/GameScreen.js';
import { Menu } from './ui/Menu.js';
import { showEndDialog, showPauseDialog, hideDialog } from './ui/Dialogs.js';
import { submitScore, flushPending, recordBest } from './ui/Highscores.js';
import { MAPS } from './data/index.js';

function showFatal(message) {
  const el = document.getElementById('fatal');
  el.textContent = '';
  const p = document.createElement('p');
  p.textContent = message;
  const backLabel = t('menu.back');
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = backLabel === 'menu.back' ? 'Back' : backLabel;
  btn.addEventListener('click', () => {
    el.hidden = true;
  });
  el.append(p, btn);
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
  sceneManager.setTheme({ sky: '#9ad7ff', fog: '#bfe6ff' });
  const models = new ModelLibrary();
  await models.preload(MODEL_NAMES);
  sceneManager.start();

  const dialogEl = document.getElementById('dialog');
  const menu = new Menu(document.getElementById('menu'), { onPlay: startGame });
  let screen = null;

  function quitToMenu() {
    hideDialog(dialogEl);
    screen?.dispose();
    screen = null;
    menu.show();
  }

  function startGame(mapId) {
    menu.hide();
    hideDialog(dialogEl);
    screen?.dispose();
    try {
      screen = new GameScreen({
        mapId,
        sceneManager,
        models,
        onEnd: ({ won, score, wave }) => {
          recordBest(mapId, score);
          showEndDialog(dialogEl, {
            won,
            score,
            wave,
            onSubmit: (name) => submitScore({ name, map: mapId, score, wave }),
            onEndless: () => {
              hideDialog(dialogEl);
              screen.game.startEndless();
            },
            onMenu: quitToMenu,
          });
        },
        onQuit: () => {
          screen.pause();
          showPauseDialog(dialogEl, {
            onResume: () => {
              hideDialog(dialogEl);
              screen.resume();
            },
            onQuit: quitToMenu,
          });
        },
      });
    } catch (err) {
      console.error(err);
      screen = null;
      menu.show();
      showFatal(t('app.startFailed'));
      return;
    }
    if (import.meta.env.DEV) window.__tt = { game: screen.game, session: screen.session, screen };
  }

  flushPending().catch(() => {});
  const requested = new URLSearchParams(location.search).get('map');
  if (requested && MAPS[requested]) startGame(requested);
  else menu.show();
}

boot().catch((err) => {
  console.error(err);
  const msg = t('app.webglMissing');
  showFatal(msg === 'app.webglMissing' ? 'Your browser could not start WebGL, which this game needs. Try a current version of Chrome, Firefox, Edge or Safari.' : msg);
});
