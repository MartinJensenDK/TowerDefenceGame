import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

describe('Highscores helpers', () => {
  let mod;
  beforeEach(async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    vi.resetModules();
    mod = await import('./Highscores.js');
  });

  it('records and reads personal bests', () => {
    expect(mod.personalBest('green')).toBeNull();
    mod.recordBest('green', 100);
    mod.recordBest('green', 50);
    expect(mod.personalBest('green')).toBe(100);
    mod.recordBest('green', 150);
    expect(mod.personalBest('green')).toBe(150);
  });

  it('queues scores when the server is unreachable and flushes later', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const r = await mod.submitScore({ name: 'Ann', map: 'green', score: 10, wave: 2 });
    expect(r).toEqual({ online: false });
    expect(mod.getPending()).toHaveLength(1);
    expect(mod.localScores('green')[0].name).toBe('Ann');
    expect(mod.rememberedName()).toBe('Ann');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, rank: 3 }) }));
    expect(await mod.flushPending()).toBe(1);
    expect(mod.getPending()).toHaveLength(0);
    const online = await mod.submitScore({ name: 'Ann', map: 'green', score: 20, wave: 3 });
    expect(online).toEqual({ online: true, rank: 3 });
  });

  it('renders an escaped scores table', () => {
    const html = mod.renderScoresTable([{ name: '<b>x</b>', score: 5, wave: 1 }]);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('never throws without localStorage', async () => {
    vi.stubGlobal('localStorage', undefined);
    vi.resetModules();
    const m = await import('./Highscores.js');
    expect(m.personalBest('green')).toBeNull();
    expect(() => m.recordBest('green', 1)).not.toThrow();
    expect(m.getPending()).toEqual([]);
  });
});
