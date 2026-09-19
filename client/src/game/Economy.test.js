import { describe, it, expect } from 'vitest';
import { Economy } from './Economy.js';

describe('Economy', () => {
  it('starts with the given gold and lives and zero score', () => {
    const e = new Economy({ gold: 200, lives: 20 });
    expect(e.snapshot()).toEqual({ gold: 200, score: 0, lives: 20 });
  });

  it('spends only when affordable', () => {
    const e = new Economy({ gold: 100 });
    expect(e.spend(60)).toBe(true);
    expect(e.gold).toBe(40);
    expect(e.spend(50)).toBe(false);
    expect(e.gold).toBe(40);
    expect(e.canAfford(40)).toBe(true);
  });

  it('earns gold and score independently', () => {
    const e = new Economy({ gold: 0 });
    e.earn({ gold: 5, score: 10 });
    e.earn({ score: 50 });
    e.earn({ gold: 20 });
    expect(e.snapshot()).toEqual({ gold: 25, score: 60, lives: 20 });
  });

  it('loses lives, floors at zero and reports death', () => {
    const e = new Economy({ gold: 0, lives: 3 });
    expect(e.loseLives(2)).toBe(false);
    expect(e.loseLives(5)).toBe(true);
    expect(e.lives).toBe(0);
  });
});
