import * as THREE from 'three';

/** Deterministic pseudo random for stable textures. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A near-white cobblestone texture that tiles once per road tile; the material colour tints it,
 * so the same texture works for every theme. Returns null outside a browser (no canvas).
 */
export function makeRoadTexture(seed = 1, size = 128) {
  if (typeof document === 'undefined') return null;
  const rng = makeRng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // packed earth base with a little grain
  ctx.fillStyle = '#d9d2c8';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const g = 190 + Math.floor(rng() * 50);
    ctx.fillStyle = `rgb(${g},${g - 4},${g - 8})`;
    ctx.fillRect(Math.floor(rng() * size), Math.floor(rng() * size), 2, 2);
  }
  // rounded cobbles in staggered rows, each a slightly different shade, with dark seams between
  const rows = 6;
  const cols = 5;
  const ch = size / rows;
  const cw = size / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? cw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * cw + off + 2 + (rng() - 0.5) * 3;
      const y = r * ch + 2 + (rng() - 0.5) * 3;
      const w = cw - 5 - rng() * 3;
      const h = ch - 5 - rng() * 3;
      const shade = 205 + Math.floor(rng() * 50);
      ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,60,50,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // a light highlight on the upper-left edge makes each stone read as rounded
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + h - 4);
      ctx.lineTo(x + 3, y + 3);
      ctx.lineTo(x + w - 4, y + 3);
      ctx.stroke();
    }
  }
  // a few sprigs of grass and dirt between the stones
  for (let i = 0; i < 18; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120,150,80,0.55)' : 'rgba(90,75,60,0.5)';
    ctx.fillRect(x, y, 2 + rng() * 2, 2 + rng() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
