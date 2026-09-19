import { loadLanguage, t } from './i18n/i18n.js';
import { SceneManager } from './render/SceneManager.js';
import { CameraRig } from './render/CameraRig.js';
import { ModelLibrary, MODEL_NAMES } from './render/ModelLibrary.js';
import { MapRenderer } from './render/MapRenderer.js';
import { Grid } from './game/Grid.js';
import { MAPS } from './data/index.js';

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
  const map = MAPS[mapId] ?? MAPS.green;
  const grid = new Grid(map);
  const mapRenderer = new MapRenderer({ scene: sceneManager.scene, map, grid, models });
  sceneManager.setTheme(mapRenderer.theme);
  sceneManager.focusSun(mapRenderer.centerX, mapRenderer.centerZ);
  const rig = new CameraRig(sceneManager.camera, canvas, {
    centerX: mapRenderer.centerX,
    centerZ: mapRenderer.centerZ,
    extent: mapRenderer.extent,
  });
  mapRenderer.setFrozen([{ x: map.paths[0][1][0], y: map.paths[0][1][1], multiplier: 0.5 }]);

  sceneManager.onFrame = (dt) => {
    mapRenderer.update(dt);
    rig.update();
  };
  sceneManager.start();
}

boot();
