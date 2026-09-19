import * as THREE from 'three';
import { TILE_SIZE } from '../game/Grid.js';
import { TILE_TOP } from './SceneManager.js';

const BAND = 0.14; // width of the frame in world units
const INSET = 0.05; // keep the frame just inside the tile edge

/** Square frame (a square with a square hole) lying flat, centred on the origin. */
function frameGeometry() {
  const outer = TILE_SIZE / 2 - INSET;
  const inner = outer - BAND;
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer);
  shape.lineTo(outer, -outer);
  shape.lineTo(outer, outer);
  shape.lineTo(-outer, outer);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-inner, -inner);
  hole.lineTo(inner, -inner);
  hole.lineTo(inner, inner);
  hole.lineTo(-inner, inner);
  hole.closePath();
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Blue frame that marks the tile the player has selected for building. */
export class TileHighlight {
  constructor(scene) {
    this.scene = scene;
    this.geometry = frameGeometry();
    this.material = new THREE.MeshBasicMaterial({ color: 0x2f9cf0, transparent: true, opacity: 0.9, depthWrite: false });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    this.time = 0;
    scene.add(this.mesh);
  }

  /** Show the frame on the tile centred at world (x, z). */
  show(x, z) {
    this.mesh.position.set(x, TILE_TOP + 0.02, z);
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.time += dt;
    this.material.opacity = 0.75 + 0.2 * Math.sin(this.time * 5);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
