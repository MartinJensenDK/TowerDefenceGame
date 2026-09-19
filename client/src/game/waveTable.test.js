import { describe, it, expect } from 'vitest';
import { WAVE_COUNT, WAVE_ROWS, BOSS_TYPES, FIRST_WAVE, generateWaveTable } from './waveTable.js';
import enemies from '../data/enemies.json';

describe('wave table', () => {
  it('has 50 rows that only use known enemies', () => {
    expect(WAVE_COUNT).toBe(50);
    expect(WAVE_ROWS).toHaveLength(50);
    for (const row of WAVE_ROWS) {
      expect(row.length).toBeGreaterThan(0);
      for (const [type, count, interval] of row) {
        expect(enemies[type], type).toBeDefined();
        expect(count).toBeGreaterThan(0);
        expect(interval).toBeGreaterThan(0);
      }
    }
  });

  it('introduces every enemy on its FIRST_WAVE and never earlier', () => {
    for (const [type, first] of Object.entries(FIRST_WAVE)) {
      const seen = WAVE_ROWS.findIndex((row) => row.some(([t]) => t === type)) + 1;
      expect(seen, type).toBe(first);
    }
    expect(Object.keys(FIRST_WAVE).sort()).toEqual(Object.keys(enemies).sort());
  });

  it('puts a boss on every 10th wave and the giant only on wave 50', () => {
    for (const w of [10, 20, 30, 40, 50]) {
      expect(WAVE_ROWS[w - 1].some(([t]) => BOSS_TYPES.includes(t))).toBe(true);
    }
    WAVE_ROWS.forEach((row, i) => {
      expect(row.some(([t]) => t === 'giant')).toBe(i === 49);
    });
  });

  it('scales counts of walkers but not bosses, speeds up intervals and deals paths', () => {
    const table = generateWaveTable({ pathCount: 3, scale: 1.5, pace: 2 });
    expect(table).toHaveLength(50);
    expect(table[0].spawns[0]).toEqual({ type: 'scout', count: 9, interval: 0.5, path: 0 });
    expect(table[2].spawns[1]).toEqual({ type: 'brute', count: 3, interval: 1, delay: 4, path: 0 });
    expect(table[49].spawns[0]).toEqual({ type: 'giant', count: 1, interval: 5, path: 1 });
    expect(table[19].spawns[0].count).toBe(1); // rhino
    const paths = new Set(table.flatMap((w) => w.spawns.map((s) => s.path)));
    expect([...paths].sort()).toEqual([0, 1, 2]);
  });

  it('omits path and delay for a single-road map with no delay', () => {
    const table = generateWaveTable();
    expect(table[0].spawns[0]).toEqual({ type: 'scout', count: 6, interval: 1 });
  });
});
