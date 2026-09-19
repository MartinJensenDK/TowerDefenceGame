import { describe, it, expect, beforeAll } from 'vitest';
import { loadLanguage, t, currentLanguage } from './i18n.js';
import en from './en.json';

describe('i18n', () => {
  beforeAll(async () => {
    await loadLanguage('en');
  });

  it('loads english and looks up keys', () => {
    expect(currentLanguage()).toBe('en');
    expect(t('hud.gold')).toBe('Gold');
  });

  it('substitutes placeholders', () => {
    expect(t('hud.wave', { wave: 3, total: 20 })).toBe('Wave 3 / 20');
  });

  it('returns the key for unknown strings', () => {
    expect(t('nope.missing')).toBe('nope.missing');
  });

  it('has a name key for every tower and enemy', () => {
    for (const id of ['crossbow', 'spike', 'cannon', 'frozen']) expect(en[`tower.${id}.name`]).toBeTruthy();
    for (const id of ['scout', 'brute', 'bat', 'boss']) expect(en[`enemy.${id}.name`]).toBeTruthy();
    for (const id of ['green', 'snow', 'desert', 'water']) expect(en[`map.${id}.name`]).toBeTruthy();
  });

  it('rejects unknown languages', async () => {
    await expect(loadLanguage('xx')).rejects.toThrow(/unknown language/);
  });
});
