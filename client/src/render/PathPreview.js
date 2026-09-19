import * as THREE from 'three';
import { polylineLength, pointAlongPolyline } from './polyline.js';

const SPACING = 1.6; // world units between arrows
const SPEED = 2.4; // world units per second
const ARROW_Y = 0.04; // just above the road top (0)

/** Flat chevron pointing along +Z (the direction `heading` = 0 faces). */
function chevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, -0.34);
  shape.lineTo(0, 0.1);
  shape.lineTo(0.42, -0.34);
  shape.lineTo(0.42, 0.02);
  shape.lineTo(0, 0.46);
  shape.lineTo(-0.42, 0.02);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // lay flat with the face up (shape +Y now points to -Z)
  geo.rotateY(Math.PI); // turn it round so the tip points along +Z
  return geo;
}

/** Blue arrows that run along every enemy path so the player can see the route before the first wave. */
export class PathPreview {
  constructor({ scene, paths }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'pathPreview';
    this.geometry = chevronGeometry();
    this.material = new THREE.MeshBasicMaterial({ color: 0x2e8bff, transparent: true, opacity: 0.9, depthWrite: false });
    this.outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x0c2f66, transparent: true, opacity: 0.9, depthWrite: false });
    this.time = 0;
    this.arrows = [];
    for (const points of paths) {
      const length = polylineLength(points);
      const count = Math.max(1, Math.floor(length / SPACING));
      for (let i = 0; i < count; i++) {
        const arrow = new THREE.Mesh(this.geometry, this.material);
        arrow.renderOrder = 5;
        const outline = new THREE.Mesh(this.geometry, this.outlineMaterial);
        outline.scale.set(1.25, 1, 1.25);
        outline.position.y = -0.005;
        arrow.add(outline);
        this.group.add(arrow);
        this.arrows.push({ mesh: arrow, points, offset: i * SPACING });
      }
    }
    this.#place();
    scene.add(this.group);
  }

  #place() {
    const travel = this.time * SPEED;
    for (const { mesh, points, offset } of this.arrows) {
      const p = pointAlongPolyline(points, offset + travel);
      mesh.position.set(p.x, ARROW_Y, p.z);
      mesh.rotation.y = p.heading;
    }
    this.material.opacity = 0.75 + 0.2 * Math.sin(this.time * 4);
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.#place();
  }

  setVisible(on) {
    this.group.visible = on;
  }

  dispose() {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.arrows = [];
  }
}
