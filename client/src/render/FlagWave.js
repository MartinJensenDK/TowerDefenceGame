import * as THREE from 'three';

/**
 * Waves a cloth mesh in the wind by displacing its vertices every frame. The pole edge (smallest
 * local x) stays put and the free end (+X) swings the most. Works for a flat plane in either the
 * XZ plane (the GLB flags) or the XY plane (placeholders); the flat axis is picked from the bounds.
 */
export class FlagWave {
  /** Returns a FlagWave for `root`'s `Flag` mesh, or null when there is none usable. */
  static attach(root, name = 'Flag') {
    const flag = root.getObjectByName(name) ?? null;
    const src = flag?.isMesh ? flag.geometry?.attributes?.position : null;
    // Interleaved attributes would not be addressable as i * 3, so leave those flags static.
    if (!src || src.isInterleavedBufferAttribute || src.itemSize !== 3) return null;
    return new FlagWave(flag);
  }

  constructor(flag) {
    this.flag = flag;
    // Instances share geometry and material with the template, so take private copies to deform.
    flag.geometry = flag.geometry.clone();
    if (flag.material && !Array.isArray(flag.material)) {
      flag.material = flag.material.clone();
      flag.material.side = THREE.DoubleSide;
    }
    const position = flag.geometry.attributes.position;
    this.rest = new Float32Array(position.array);
    flag.geometry.computeBoundingBox();
    const bb = flag.geometry.boundingBox;
    this.x0 = bb.min.x;
    this.width = Math.max(1e-3, bb.max.x - bb.min.x);
    this.flat = bb.max.y - bb.min.y <= bb.max.z - bb.min.z ? 1 : 2;
    this.up = this.flat === 1 ? 2 : 1;
    // Displacement is in local units, so the mesh scale already shrinks it for small pennants;
    // those just ripple a little faster than the big castle banner, and each flag has its own phase.
    const worldWidth = this.width * flag.scale.x;
    this.speed = 1 + 0.6 * (1 - Math.min(1, worldWidth / 1.2));
    this.phase = Math.random() * Math.PI * 2;
  }

  update(time) {
    const position = this.flag.geometry.attributes.position;
    const arr = position.array;
    const rest = this.rest;
    const { flat, up } = this;
    const t = time * this.speed + this.phase;
    for (let i = 0; i < position.count; i++) {
      const b = i * 3;
      const x = rest[b];
      const f = (x - this.x0) / this.width; // 0 at the pole, 1 at the free end
      arr[b + flat] = rest[b + flat] + Math.sin(x * 4 - t * 5) * 0.1 * f;
      arr[b + up] = rest[b + up] + Math.sin(x * 6 - t * 7) * 0.06 * f;
    }
    position.needsUpdate = true;
    this.flag.geometry.computeVertexNormals();
  }

  dispose() {
    this.flag.geometry.dispose();
    if (this.flag.material && !Array.isArray(this.flag.material)) this.flag.material.dispose();
  }
}
