import express from 'express';
import path from 'node:path';

export const MAP_IDS = ['green', 'snow', 'desert', 'water', 'vast', 'dunes'];
const NAME_MAX = 16;

/**
 * The logged-in player, from the headers the GameHub portal adds when it proxies to this server (it drops client
 * copies, and this server only listens on 127.0.0.1): X-User-Id and X-User-Name (display name, percent-encoded).
 * Null for a guest.
 */
export function hubPlayer(req) {
  const id = Number(req.get('x-user-id'));
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  let name = null;
  try {
    name = decodeURIComponent(req.get('x-user-name') ?? '').trim() || null;
  } catch {
    name = null;
  }
  return { id, name };
}

/**
 * Builds the Express app.
 * @param {{db: ReturnType<import('./db.js').openDb>, staticDir?: string, rateLimit?: {max:number, windowMs:number}}} opts
 */
export function createApp({ db, staticDir = null, rateLimit = { max: 5, windowMs: 60_000 } }) {
  const app = express();
  // behind Nginx and the GameHub portal (both on this machine) the client address is the last non-loopback
  // X-Forwarded-For entry; with a hop count of 1 every player would share the hub's address in the rate limiter
  app.set('trust proxy', 'loopback');
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
    // a logged-in player always scores under their account's display name; a guest types a name
    const player = hubPlayer(req);
    if (player && !player.name) return res.status(400).json({ error: 'no display name' });
    const name = player ? player.name : typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > NAME_MAX) return res.status(400).json({ error: 'invalid name' });
    if (!MAP_IDS.includes(body.map)) return res.status(400).json({ error: 'unknown map' });
    const { score, wave } = body;
    if (!Number.isInteger(score) || score < 0 || !Number.isInteger(wave) || wave < 0) {
      return res.status(400).json({ error: 'invalid score' });
    }
    if (isLimited(req.ip)) return res.status(429).json({ error: 'too many requests' });
    const { rank } = db.insert({ name, map: body.map, score, wave, userId: player?.id ?? null });
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

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'internal error' : (err.type === 'entity.too.large' ? 'body too large' : 'invalid json') });
  });

  return app;
}
