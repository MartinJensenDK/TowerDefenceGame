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
  // shared login on game.martin-jensen.dk: a score from a logged-in player carries the hub's user id; scores from
  // before (and from guests) have none and are shown as guest scores
  const columns = db.prepare('SELECT name FROM pragma_table_info(?)').all('highscores').map((c) => c.name);
  if (!columns.includes('user_id')) db.exec('ALTER TABLE highscores ADD COLUMN user_id INTEGER');

  const insertStmt = db.prepare('INSERT INTO highscores (name, map, score, wave, user_id) VALUES (?, ?, ?, ?, ?)');
  const topStmt = db.prepare(
    `SELECT name, score, wave, created_at, user_id IS NULL AS guest FROM highscores
     WHERE map = ? ORDER BY score DESC, id ASC LIMIT ?`,
  );
  const rankStmt = db.prepare('SELECT COUNT(*) AS n FROM highscores WHERE map = ? AND score > ?');

  return {
    /** userId: the hub account's id, or null for a guest */
    insert({ name, map, score, wave, userId = null }) {
      const result = insertStmt.run(name, map, score, wave, userId);
      const better = rankStmt.get(map, score).n;
      return { id: Number(result.lastInsertRowid), rank: better + 1 };
    },
    top(map, limit) {
      return topStmt.all(map, limit).map((r) => ({ ...r, guest: r.guest === 1 }));
    },
    close() {
      db.close();
    },
  };
}
