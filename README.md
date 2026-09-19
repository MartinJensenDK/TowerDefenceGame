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
- `blender/troll-towers.blend` – source file for all 14 models (one collection per model; re-export a collection to `client/public/models/<name>.glb` with glTF Binary, +Y up, Apply Modifiers)
- `server/` – Express API + SQLite
- `docs/superpowers/` – design spec and implementation plan

## Adding a map / tower / enemy
- Map: add `client/src/data/maps/<id>.json` (see existing ones), register it in `client/src/data/index.js`, add `map.<id>.name` / `.description` to `client/src/i18n/en.json`, add the id to `MAP_IDS` in `server/app.js`, add a theme in `client/src/render/MapRenderer.js`.
- Tower: add to `towers.json`, `TOWER_ORDER`, i18n `tower.<id>.*`, a placeholder builder in `render/placeholders.js` and `MODEL_NAMES`.
- Enemy: add to `enemies.json`, i18n `enemy.<id>.name`, placeholder + `MODEL_NAMES`.
