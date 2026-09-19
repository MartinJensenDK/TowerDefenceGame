import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/** Opens (and migrates) the SQLite highscore database. */
export function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS highscores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      map TEXT NOT NULL,
      score INTEGER NOT NULL,
      wave INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_highscores_map_score ON highscores (map, score DESC);
  `);

  const insertStmt = db.prepare('INSERT INTO highscores (name, map, score, wave) VALUES (?, ?, ?, ?)');
  const topStmt = db.prepare(
    'SELECT name, score, wave, created_at FROM highscores WHERE map = ? ORDER BY score DESC, id ASC LIMIT ?',
  );
  const rankStmt = db.prepare('SELECT COUNT(*) AS n FROM highscores WHERE map = ? AND score > ?');

  return {
    insert({ name, map, score, wave }) {
      const result = insertStmt.run(name, map, score, wave);
      const better = rankStmt.get(map, score).n;
      return { id: Number(result.lastInsertRowid), rank: better + 1 };
    },
    top(map, limit) {
      return topStmt.all(map, limit);
    },
    close() {
      db.close();
    },
  };
}
