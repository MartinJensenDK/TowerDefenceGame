import * as THREE from 'three';
import { TILE_SIZE } from '../game/Grid.js';
import { TILE_TOP } from './SceneManager.js';

/** World-space reach of a tower: freeze towers cover a square of tiles, everything else a radius. */
export function towerReach(def, stats) {
  return def.kind === 'freeze' ? (stats.freezeRadius + 0.5) * TILE_SIZE : stats.range;
}

/** Thin blue ring plus a faint fill that shows how far a selected tower reaches. The band sits inside the true range. */
export class RangeRing {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.ringGeometry = new THREE.RingGeometry(0.955, 1, 96);
    this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0x2f9cf0, transparent: true, opacity: 0.85, depthWrite: false });
    this.fillGeometry = new THREE.CircleGeometry(0.955, 96);
    this.fillMaterial = new THREE.MeshBasicMaterial({ color: 0x2f9cf0, transparent: true, opacity: 0.1, depthWrite: false });
    const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    ring.renderOrder = 7;
    const fill = new THREE.Mesh(this.fillGeometry, this.fillMaterial);
    fill.renderOrder = 6;
    this.group.add(fill, ring);
    this.group.rotation.x = -Math.PI / 2;
    this.time = 0;
    scene.add(this.group);
  }

  /** Show the ring centred at world (x, z) with the given radius in world units. */
  show(x, z, radius) {
    this.group.position.set(x, TILE_TOP + 0.03, z);
    this.group.scale.setScalar(radius);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.ringMaterial.opacity = 0.7 + 0.2 * Math.sin(this.time * 5);
  }

  dispose() {
    this.scene.remove(this.group);
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.fillGeometry.dispose();
    this.fillMaterial.dispose();
  }
}
