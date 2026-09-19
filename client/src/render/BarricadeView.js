import * as THREE from 'three';
import { HP_STEPS, hpTexture, hpLevel } from './hpBar.js';

const POP = 0.35; // seconds to rise when rebuilt / collapse when smashed

/**
 * A wooden barricade across a road entry: two crossed-log frames, a rail and iron spikes, with an
 * hp bar above. Rises when it stands and collapses into the ground when smashed.
 */
export class BarricadeView {
  constructor(barricade, scene) {
    this.barricade = barricade;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(barricade.x, 0, barricade.z);
    this.root.rotation.y = barricade.heading; // local +Z points down the road toward the castle
    this.geometries = [];
    this.wood = new THREE.MeshToonMaterial({ color: 0x8a5a2b });
    this.woodDark = new THREE.MeshToonMaterial({ color: 0x5a3a1a });
    this.iron = new THREE.MeshToonMaterial({ color: 0x9aa0a8 });
    this.rope = new THREE.MeshToonMaterial({ color: 0xc9a86a });
    this.#build();
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTexture(HP_STEPS), transparent: true, depthTest: false }));
    this.hpBar.scale.set(1.4, 0.2, 1);
    this.hpBar.position.set(0, 1.45, 0);
    this.hpBar.renderOrder = 10;
    this.root.add(this.hpBar);
    this.hpLevel = HP_STEPS;
    this.standing = barricade.standing;
    this.pop = 0;
    this.root.visible = barricade.active;
    scene.add(this.root);
  }

  #log(w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const geo = new THREE.CylinderGeometry(w, w, h, 7);
    this.geometries.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }

  #build() {
    // X-frames across the road (local X), one either side of the centre
    for (const x of [-0.6, 0.6]) {
      this.#log(0.06, 1.3, 0.06, this.woodDark, x, 0.55, 0, 0.6, 0, 0);
      this.#log(0.06, 1.3, 0.06, this.woodDark, x, 0.55, 0, -0.6, 0, 0);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), this.rope);
      this.geometries.push(knot.geometry);
      knot.position.set(x, 0.55, 0);
      this.root.add(knot);
    }
    // top rail and a lower rail along X
    this.#log(0.07, 1.9, 0.07, this.wood, 0, 0.98, 0, 0, 0, Math.PI / 2);
    this.#log(0.05, 1.9, 0.05, this.wood, 0, 0.35, 0, 0, 0, Math.PI / 2);
    // sharpened stakes pointing at the incoming trolls (local -Z)
    for (const x of [-0.75, -0.25, 0.25, 0.75]) {
      const geo = new THREE.ConeGeometry(0.07, 0.55, 6);
      this.geometries.push(geo);
      const spike = new THREE.Mesh(geo, this.iron);
      spike.position.set(x, 0.98, -0.3);
      spike.rotation.x = -Math.PI / 2 - 0.35;
      spike.castShadow = true;
      this.root.add(spike);
    }
    // sandbags at the feet
    for (const x of [-0.9, 0.9]) {
      const geo = new THREE.SphereGeometry(0.22, 8, 6);
      this.geometries.push(geo);
      const bag = new THREE.Mesh(geo, this.rope);
      bag.position.set(x, 0.14, 0.1);
      bag.scale.set(1, 0.6, 0.8);
      bag.receiveShadow = true;
      this.root.add(bag);
    }
  }

  update(dt) {
    const b = this.barricade;
    this.root.visible = b.active;
    if (!b.active) return;
    if (b.standing !== this.standing) {
      this.standing = b.standing;
      this.pop = POP;
    }
    if (this.pop > 0) {
      this.pop = Math.max(0, this.pop - dt);
      const k = 1 - this.pop / POP;
      const s = this.standing ? k : 1 - k;
      this.root.scale.set(1, Math.max(0.02, s), 1);
      this.root.rotation.z = this.standing ? 0 : (1 - s) * 0.35;
    } else {
      this.root.scale.set(1, this.standing ? 1 : 0.02, 1);
    }
    this.hpBar.visible = this.standing;
    const level = hpLevel(b.hp, b.maxHp);
    if (level !== this.hpLevel) {
      this.hpLevel = level;
      this.hpBar.material.map = hpTexture(level);
      this.hpBar.material.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.root);
    for (const g of this.geometries) g.dispose();
    for (const m of [this.wood, this.woodDark, this.iron, this.rope]) m.dispose();
    this.hpBar.material.dispose();
  }
}
