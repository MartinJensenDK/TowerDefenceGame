import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? path.join(here, 'data', 'highscores.db');
const STATIC_DIR = path.join(here, '..', 'client', 'dist');

const db = openDb(DB_PATH);
const app = createApp({ db, staticDir: STATIC_DIR });

const server = app.listen(PORT, () => {
  console.log(`Troll Towers server listening on http://localhost:${PORT} (db: ${DB_PATH})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
