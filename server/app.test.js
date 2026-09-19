import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openDb } from './db.js';
import { createApp } from './app.js';

let db;
let app;
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'troll-towers-'));
  db = openDb(path.join(dir, 'test.db'));
  app = createApp({ db, rateLimit: { max: 5, windowMs: 60_000 } });
});

afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('POST /api/highscores', () => {
  it('stores a score and returns its rank', async () => {
    const a = await request(app).post('/api/highscores').send({ name: 'Anna', map: 'green', score: 500, wave: 12 });
    expect(a.status).toBe(201);
    expect(a.body).toEqual({ ok: true, rank: 1 });
    const b = await request(app).post('/api/highscores').send({ name: 'Bo', map: 'green', score: 900, wave: 20 });
    expect(b.body.rank).toBe(1);
    const c = await request(app).post('/api/highscores').send({ name: 'Cy', map: 'green', score: 700, wave: 15 });
    expect(c.body.rank).toBe(2);
  });

  it('rejects bad names, maps and scores', async () => {
    const bad = [
      { name: '', map: 'green', score: 1, wave: 1 },
      { name: 'x'.repeat(17), map: 'green', score: 1, wave: 1 },
      { name: 'ok', map: 'moon', score: 1, wave: 1 },
      { name: 'ok', map: 'green', score: -1, wave: 1 },
      { name: 'ok', map: 'green', score: 1.5, wave: 1 },
      { name: 'ok', map: 'green', score: 1, wave: 'a' },
    ];
    for (const body of bad) {
      const res = await request(app).post('/api/highscores').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
  });

  it('trims names', async () => {
    await request(app).post('/api/highscores').send({ name: '  Dee  ', map: 'snow', score: 10, wave: 1 });
    const res = await request(app).get('/api/highscores?map=snow');
    expect(res.body[0].name).toBe('Dee');
  });

  it('rate limits after 5 posts per minute', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/highscores').send({ name: 'Spam', map: 'green', score: i, wave: 1 });
      expect(res.status).toBe(201);
    }
    const res = await request(app).post('/api/highscores').send({ name: 'Spam', map: 'green', score: 99, wave: 1 });
    expect(res.status).toBe(429);
  });
});

describe('GET /api/highscores', () => {
  it('returns scores for a map ordered by score desc, with limit clamped', async () => {
    for (let i = 1; i <= 4; i++) {
      await request(app).post('/api/highscores').send({ name: `P${i}`, map: 'desert', score: i * 100, wave: i });
    }
    await request(app).post('/api/highscores').send({ name: 'Other', map: 'water', score: 5000, wave: 3 });
    const res = await request(app).get('/api/highscores?map=desert&limit=2');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.name)).toEqual(['P4', 'P3']);
    expect(res.body[0]).toMatchObject({ score: 400, wave: 4 });
    expect(typeof res.body[0].created_at).toBe('string');

    const all = await request(app).get('/api/highscores?map=desert&limit=999');
    expect(all.body).toHaveLength(4);
    const one = await request(app).get('/api/highscores?map=desert&limit=0');
    expect(one.body).toHaveLength(1);
    const dflt = await request(app).get('/api/highscores?map=desert&limit=abc');
    expect(dflt.body).toHaveLength(4);
  });

  it('rejects unknown maps', async () => {
    const res = await request(app).get('/api/highscores?map=mars');
    expect(res.status).toBe(400);
  });
});

describe('static hosting', () => {
  it('serves index.html for non-api routes when a static dir is given', async () => {
    const staticDir = path.join(dir, 'dist');
    fs.mkdirSync(staticDir);
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<h1>hi</h1>');
    const served = createApp({ db, staticDir });
    const root = await request(served).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('hi');
    const deep = await request(served).get('/some/route');
    expect(deep.status).toBe(200);
    expect(deep.text).toContain('hi');
    const api = await request(served).get('/api/nothing');
    expect(api.status).toBe(404);
  });
});

describe('body parsing', () => {
  it('returns JSON error for invalid JSON', async () => {
    const res = await request(app).post('/api/highscores').set('content-type', 'application/json').send('{not json');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('returns JSON error for body too large', async () => {
    const res = await request(app).post('/api/highscores').send({ name: 'x'.repeat(5000), map: 'green', score: 1, wave: 1 });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('body too large');
  });
});
