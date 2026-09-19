import { describe, it, expect } from 'vitest';
import { hpMultiplier, waveBonus, buildSchedule, WaveRun, generateEndlessWave, ENDLESS_MIX } from './Wave.js';

describe('formulas', () => {
  it('scales hp by 6% per wave after the first', () => {
    expect(hpMultiplier(1)).toBe(1);
    expect(hpMultiplier(11)).toBeCloseTo(1.6);
  });

  it('gives 20 gold and 50 x wave score', () => {
    expect(waveBonus(1)).toEqual({ gold: 20, score: 50 });
    expect(waveBonus(20)).toEqual({ gold: 20, score: 1000 });
  });
});

describe('buildSchedule', () => {
  it('expands counts, intervals and delays into a sorted timeline', () => {
    const s = buildSchedule({
      spawns: [
        { type: 'brute', count: 2, interval: 2, delay: 1, path: 1 },
        { type: 'scout', count: 3, interval: 0.5 },
      ],
    });
    expect(s).toEqual([
      { at: 0, type: 'scout', path: 0 },
      { at: 0.5, type: 'scout', path: 0 },
      { at: 1, type: 'brute', path: 1 },
      { at: 1, type: 'scout', path: 0 },
      { at: 3, type: 'brute', path: 1 },
    ]);
  });
});

describe('WaveRun', () => {
  it('releases spawns as time passes', () => {
    const run = new WaveRun(3, { spawns: [{ type: 'scout', count: 3, interval: 1 }] });
    expect(run.number).toBe(3);
    expect(run.update(0).map((s) => s.type)).toEqual(['scout']);
    expect(run.update(0.5)).toEqual([]);
    expect(run.update(0.5)).toHaveLength(1);
    expect(run.spawningDone).toBe(false);
    expect(run.update(5)).toHaveLength(1);
    expect(run.spawningDone).toBe(true);
    expect(run.update(5)).toEqual([]);
  });
});

describe('generateEndlessWave', () => {
  const cost = Object.fromEntries(ENDLESS_MIX.map((m) => [m.type, m.cost]));

  it('spends exactly the budget 40 + 8n on non-boss enemies', () => {
    for (const n of [21, 25, 33]) {
      const wave = generateEndlessWave(n, 1, () => 0.3);
      const spent = wave.spawns.filter((s) => s.type !== 'boss').reduce((sum, s) => sum + cost[s.type] * s.count, 0);
      expect(spent).toBe(40 + 8 * n);
    }
  });

  it('adds bosses only every 10th wave', () => {
    expect(generateEndlessWave(21, 1, () => 0.1).spawns.some((s) => s.type === 'boss')).toBe(false);
    const w30 = generateEndlessWave(30, 1, () => 0.1);
    expect(w30.spawns.find((s) => s.type === 'boss').count).toBe(2);
  });

  it('is deterministic for a given rng and spreads spawns across paths', () => {
    const rng = () => 0.9; // always picks the last (brute) entry
    const a = generateEndlessWave(22, 2, rng);
    const b = generateEndlessWave(22, 2, rng);
    expect(a).toEqual(b);
    expect(a.spawns.every((s) => s.path < 2)).toBe(true);
  });

  it('produces valid spawn entries', () => {
    const wave = generateEndlessWave(41, 2);
    for (const s of wave.spawns) {
      expect(s.count).toBeGreaterThan(0);
      expect(s.interval).toBeGreaterThan(0);
      expect(['scout', 'bat', 'brute', 'boss']).toContain(s.type);
    }
  });
});
