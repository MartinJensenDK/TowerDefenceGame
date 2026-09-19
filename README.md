# Troll Towers

A cartoon 3D tower defence for the browser. Three.js client, Express + SQLite highscore server.

## Develop
```bash
npm install
npm run dev        # client on http://localhost:5173 (proxies /api), server on :3000
npm test           # vitest: game logic + API
```

## Build and run like production
```bash
npm run build      # -> client/dist
npm start          # serves client/dist and /api on $PORT (default 3000)
```

For `.env` to be read by plain `npm start`, run `node --env-file=.env server/index.js` (Node 22+).

## Deploy on CloudPanel (Node.js site)
1. Create a **Node.js** site in CloudPanel, note the **App Port** it assigns (e.g. 3000) and the site user.
2. As the site user, clone this repo into the site's root and run:
   ```bash
   npm ci
   npm run build
   ```
   `better-sqlite3` downloads a prebuilt binary for common Linux/Node combinations; if `npm ci` tries to compile it instead, install `build-essential` and `python3` on the host first.
3. Create `.env` from `.env.example` and set `PORT` to the App Port. `DB_PATH` may point anywhere writable (default `server/data/highscores.db`).
4. Start with PM2 (installed on CloudPanel Node.js sites):
   ```bash
   pm2 start server/index.js --name troll-towers --node-args="--env-file=.env"
   pm2 save
   ```
   Or set the CloudPanel site's start command to `node server/index.js`.
5. Updates: `git pull && npm ci && npm run build && pm2 restart troll-towers`.

CloudPanel's Nginx proxies the domain to the App Port, so no extra config is needed. Because the app sets `trust proxy`, the rate limiter sees real client IPs.

## Project layout
- `client/src/game/` – pure simulation (tested)
- `client/src/render/` – Three.js views and effects
- `client/src/ui/` – HTML overlay (HUD, panels, menu)
- `client/src/data/` – towers, enemies and maps (JSON)
- `client/public/models/` – the game's `.glb` models, see `docs/model-contract.md`
- `blender/troll-towers.blend` – source file for all 21 models (one collection per model; re-export a collection to `client/public/models/<name>.glb` with glTF Binary, +Y up, Apply Modifiers)
- `server/` – Express API + SQLite
- `docs/superpowers/` – design spec and implementation plan

## Waves and trolls

Every map has 50 waves built from one shared table (`client/src/game/waveTable.js`, expanded per map by `node scripts/regenerate-waves.mjs` and stored in the map JSON so a map can still be hand-tuned). New trolls arrive as the waves climb: scouts, brutes and bats first, archer and armoured trolls from wave 11, wolf riders from 21, eagle riders (flying) from 31. A boss comes every 10th wave: the Boss Troll (10), the Rhino Knight on his armoured rhino with a flaming sword (20), the Wolf Master dragging his club behind three wolves (30), both again (40) and finally the Troll King on wave 50, a very slow giant in full plate with a tower shield and a glowing sword that costs 20 lives if he gets in. Endless mode (wave 51+) mixes every regular troll, rotates the bosses every 10th wave and adds a Troll King every 50th. Stats live in `client/src/data/enemies.json`.

## Castle upgrades

Click the castle to buy upgrades (each up to level 10, stats in `client/src/data/castle.json`): a **Barricade** at every road entry that walking trolls must chop through (bats fly over; it mends itself when left alone and is rebuilt 20 s after being smashed), and **Wall Archers**, troll archers on the walls that shoot at anything near the castle.

## Generating maps
The big 100×100 maps (`vast`, `dunes`) are produced by a seeded generator, not written by hand. Re-create one with `node scripts/generate-map.mjs --id vast --name "Vast Meadows" --theme green --seed 7 --layout spiral --description "…"` (`--layout spiral` gives one very long road that spirals in with alternating tight and wide rings, so towers between two rings hit both; `--mountain` puts the 30×6-tile mountain ridge (`decor_mountain`, listed in the map's `props`, tiles `M`) on the north edge; the default `trails` layout gives three winding roads from three edges) — it writes `client/src/data/maps/<id>.json` with three winding roads from three map edges, a castle near the middle and the shared 50-wave table (`client/src/game/waveTable.js`) with 1.5× as many walkers, riders and flyers. The same seed always yields the same map; register the result as described below.

## Adding a map / tower / enemy
- Map: add `client/src/data/maps/<id>.json` (see existing ones), register it in `client/src/data/index.js`, add `map.<id>.name` / `.description` to `client/src/i18n/en.json`, add the id to `MAP_IDS` in `server/app.js`, add a theme in `client/src/render/MapRenderer.js`.
- Tower: add to `towers.json`, `TOWER_ORDER`, i18n `tower.<id>.*`, a placeholder builder in `render/placeholders.js` and `MODEL_NAMES`.
- Enemy: add to `enemies.json`, i18n `enemy.<id>.name`, placeholder + `MODEL_NAMES`.
