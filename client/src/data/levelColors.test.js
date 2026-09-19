import { describe, it, expect } from 'vitest';
import { LEVEL_COLORS, levelColor } from './levelColors.js';
import towers from './towers.json';

describe('level colours', () => {
  it('has one distinct colour per tower level', () => {
    for (const def of Object.values(towers)) expect(LEVEL_COLORS).toHaveLength(def.levels.length);
    expect(new Set(LEVEL_COLORS).size).toBe(LEVEL_COLORS.length);
    for (const c of LEVEL_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('clamps out-of-range levels', () => {
    expect(levelColor(0)).toBe(LEVEL_COLORS[0]);
    expect(levelColor(99)).toBe(LEVEL_COLORS.at(-1));
    expect(levelColor(-3)).toBe(LEVEL_COLORS[0]);
  });
});
