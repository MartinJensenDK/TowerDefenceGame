import * as THREE from 'three';
import { polylineLength, pointAlongPolyline } from './polyline.js';

const SPACING = 1.1; // world units between arrows
const SPEED = 1.8; // world units per second the arrows travel
const PULSE_LENGTH = 6; // world units between brightness peaks running along the route
const PULSE_SPEED = 5; // world units per second the brightness peaks travel
const ARROW_Y = 0.035; // just above the road top (0)
const BASE_COLOR = new THREE.Color(0x2f9cf0);
const PEAK_COLOR = new THREE.Color(0xdff6ff);

/** Slim chevron stroke pointing along +Z: two thin arms meeting at the tip. */
function chevronGeometry() {
  const w = 0.3; // half width
  const h = 0.26; // arm depth
  const t = 0.11; // stroke thickness
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h);
  shape.lineTo(0, 0);
  shape.lineTo(w, -h);
  shape.lineTo(w, -h - t);
  shape.lineTo(0, -t);
  shape.lineTo(-w, -h - t);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // lay flat, face up (shape +Y now points to -Z)
  geo.rotateY(Math.PI); // turn it round so the tip points along +Z
  geo.translate(0, 0, 0.18); // centre the stroke on its anchor point
  return geo;
}

/**
 * Light blue chevrons that flow along every enemy path so the player sees the route before the first wave.
 * A brightness pulse runs along the route, making each chevron flare up and grow as it passes.
 */
export class PathPreview {
  constructor({ scene, paths }) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'pathPreview';
    this.geometry = chevronGeometry();
    this.materials = [];
    this.time = 0;
    this.arrows = [];
    for (const points of paths) {
      const length = polylineLength(points);
      const count = Math.max(1, Math.floor(length / SPACING));
      for (let i = 0; i < count; i++) {
        const core = new THREE.MeshBasicMaterial({ color: 0x3fb2ff, transparent: true, opacity: 0.95, depthWrite: false });
        this.materials.push(core);
        const mesh = new THREE.Mesh(this.geometry, core);
        mesh.renderOrder = 6;
        this.group.add(mesh);
        this.arrows.push({ mesh, core, points, offset: i * SPACING });
      }
    }
    this.#place();
    scene.add(this.group);
  }

  #place() {
    const travel = this.time * SPEED;
    const pulse = this.time * PULSE_SPEED;
    for (const { mesh, core, points, offset } of this.arrows) {
      const d = offset + travel;
      const p = pointAlongPolyline(points, d);
      mesh.position.set(p.x, ARROW_Y, p.z);
      mesh.rotation.y = p.heading;
      // 0..1 brightness peak travelling along the route ahead of the arrows themselves.
      const k = 0.5 + 0.5 * Math.cos(((d - pulse) / PULSE_LENGTH) * Math.PI * 2);
      const s = k * k;
      core.opacity = 0.6 + 0.4 * s;
      core.color.copy(BASE_COLOR).lerp(PEAK_COLOR, s);
      const scale = 0.9 + 0.35 * s;
      mesh.scale.set(scale, 1, scale);
    }
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
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.arrows = [];
  }
}
