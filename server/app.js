import express from 'express';
import path from 'node:path';

export const MAP_IDS = ['green', 'snow', 'desert', 'water'];
const NAME_MAX = 16;

/**
 * Builds the Express app.
 * @param {{db: ReturnType<import('./db.js').openDb>, staticDir?: string, rateLimit?: {max:number, windowMs:number}}} opts
 */
export function createApp({ db, staticDir = null, rateLimit = { max: 5, windowMs: 60_000 } }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2kb' }));

  const hits = new Map(); // ip -> timestamps
  function isLimited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < rateLimit.windowMs);
    if (recent.length >= rateLimit.max) {
      hits.set(ip, recent);
      return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
  }

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/highscores', (req, res) => {
    const map = String(req.query.map ?? '');
    if (!MAP_IDS.includes(map)) return res.status(400).json({ error: 'unknown map' });
    let limit = Number.parseInt(String(req.query.limit ?? '10'), 10);
    if (!Number.isFinite(limit)) limit = 10;
    limit = Math.min(50, Math.max(1, limit));
    res.json(db.top(map, limit));
  });

  app.post('/api/highscores', (req, res) => {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) return res.status(400).json({ error: 'invalid name' });
    if (!MAP_IDS.includes(body.map)) return res.status(400).json({ error: 'unknown map' });
    const { score, wave } = body;
    if (!Number.isInteger(score) || score < 0 || !Number.isInteger(wave) || wave < 0) {
      return res.status(400).json({ error: 'invalid score' });
    }
    if (isLimited(req.ip)) return res.status(429).json({ error: 'too many requests' });
    const { rank } = db.insert({ name, map: body.map, score, wave });
    res.status(201).json({ ok: true, rank });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  if (staticDir) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}
