import * as THREE from 'three';

export const HP_STEPS = 32;
const hpTextures = new Map();

/** Shared hp-bar textures: one per fill level, drawn once and reused by every troll and barricade. */
export function hpTexture(level) {
  if (hpTextures.has(level)) return hpTextures.get(level);
  const w = 66;
  const h = 10;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d1a16';
  ctx.fillRect(0, 0, w, h);
  const ratio = level / HP_STEPS;
  ctx.fillStyle = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ffb347' : '#ff5544';
  ctx.fillRect(2, 2, Math.round((w - 4) * ratio), h - 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  hpTextures.set(level, tex);
  return tex;
}

/** Fill level (0..HP_STEPS) for an hp fraction, so callers can detect when the texture must change. */
export function hpLevel(hp, maxHp) {
  return Math.max(0, Math.min(HP_STEPS, Math.ceil((hp / Math.max(1e-9, maxHp)) * HP_STEPS)));
}
