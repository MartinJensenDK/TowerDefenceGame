import * as THREE from 'three';
import { TILE_SIZE, TILE } from '../game/Grid.js';
import { TILE_TOP } from './SceneManager.js';

export const THEMES = {
  green: { sky: '#9ad7ff', fog: '#bfe6ff', ground: ['#6fbf4a', '#63b03f'], road: '#c9a36b', water: '#3f8fd8', decor: ['decor_tree', 'decor_rock'] },
  snow: { sky: '#dbe9ff', fog: '#e8f0ff', ground: ['#eef4ff', '#dfe8f7'], road: '#b9c4d4', water: '#7fb3e6', decor: ['decor_tree', 'decor_rock'] },
  desert: { sky: '#ffd9a0', fog: '#ffe6bf', ground: ['#e8c878', '#dcb964'], road: '#b58a4e', water: '#4aa3d8', decor: ['decor_cactus', 'decor_rock'] },
  water: { sky: '#8fd0d8', fog: '#bfe7ea', ground: ['#5da85a', '#4f9a4f'], road: '#8f7a55', water: '#2f7fc6', decor: ['decor_reed', 'decor_tree'] },
};

const TILE_THICKNESS = 0.5;

/** Deterministic pseudo random so decor placement is stable per map. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Draws the tiles, decor, base, spawn gates and frozen overlays for one map. */
export class MapRenderer {
  constructor({ scene, map, grid, models }) {
    this.scene = scene;
    this.map = map;
    this.grid = grid;
    this.models = models;
    this.theme = THEMES[map.theme] ?? THEMES.green;
    this.group = new THREE.Group();
    this.group.name = 'map';
    this.frozenGroup = new THREE.Group();
    this.groundMeshes = [];
    this.ownedGeometries = [];
    this.ownedMaterials = [];
    this.time = 0;
    this.frozenMaterial = new THREE.MeshToonMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false });
    this.frozenGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.96, TILE_SIZE * 0.96);

    this.#buildTiles();
    this.#buildDecor();
    this.#buildLandmarks();
    this.group.add(this.frozenGroup);
    scene.add(this.group);
  }

  get centerX() {
    return (this.map.width * TILE_SIZE) / 2;
  }

  get centerZ() {
    return (this.map.height * TILE_SIZE) / 2;
  }

  get extent() {
    return (Math.max(this.map.width, this.map.height) * TILE_SIZE) / 2;
  }

  #buildTiles() {
    const { width, height, tiles } = this.map;
    const box = new THREE.BoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE);
    const mats = {
      g0: new THREE.MeshToonMaterial({ color: this.theme.ground[0] }),
      g1: new THREE.MeshToonMaterial({ color: this.theme.ground[1] }),
      road: new THREE.MeshToonMaterial({ color: this.theme.road }),
      water: new THREE.MeshToonMaterial({ color: this.theme.water, transparent: true, opacity: 0.9 }),
    };
    this.ownedGeometries.push(box);
    this.ownedMaterials.push(mats.g0, mats.g1, mats.road, mats.water);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = tiles[y][x];
        let mat;
        let top;
        if (type === TILE.ROAD) {
          mat = mats.road;
          top = 0;
        } else if (type === TILE.WATER) {
          mat = mats.water;
          top = -0.2;
        } else {
          mat = (x + y) % 2 ? mats.g0 : mats.g1;
          top = TILE_TOP;
        }
        const m = new THREE.Mesh(box, mat);
        m.position.set((x + 0.5) * TILE_SIZE, top - TILE_THICKNESS / 2, (y + 0.5) * TILE_SIZE);
        m.receiveShadow = true;
        m.castShadow = type !== TILE.WATER;
        m.userData.tile = { x, y, type };
        this.group.add(m);
        this.groundMeshes.push(m);
      }
    }
    const slabGeometry = new THREE.BoxGeometry(width * TILE_SIZE + 1.5, 1.6, height * TILE_SIZE + 1.5);
    const slabMaterial = new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.ground[1]).multiplyScalar(0.55) });
    this.ownedGeometries.push(slabGeometry);
    this.ownedMaterials.push(slabMaterial);
    const slab = new THREE.Mesh(slabGeometry, slabMaterial);
    slab.position.set(this.centerX, -TILE_THICKNESS - 0.8, this.centerZ);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  #buildDecor() {
    const rng = makeRng(hashString(this.map.id));
    const { width, height, tiles } = this.map;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] !== TILE.DECOR) continue;
        const name = this.theme.decor[Math.floor(rng() * this.theme.decor.length)];
        const { root } = this.models.instantiate(name);
        const w = this.grid.tileToWorld(x, y);
        root.position.set(w.x + (rng() - 0.5) * 0.4, TILE_TOP, w.z + (rng() - 0.5) * 0.4);
        root.rotation.y = rng() * Math.PI * 2;
        root.scale.setScalar(0.9 + rng() * 0.3);
        this.group.add(root);
      }
    }
  }

  #buildLandmarks() {
    const [bx, by] = this.map.base;
    const base = this.models.instantiate('base_castle').root;
    const bw = this.grid.tileToWorld(bx, by);
    base.position.set(bw.x, 0, bw.z);
    this.group.add(base);

    for (const path of this.map.paths) {
      const [sx, sy] = path[0];
      const [nx, ny] = path[1];
      const gate = this.models.instantiate('spawn_gate').root;
      const gw = this.grid.tileToWorld(sx, sy);
      gate.position.set(gw.x, 0, gw.z);
      gate.rotation.y = Math.atan2(nx - sx, ny - sy);
      this.group.add(gate);
    }
  }

  /** Replaces the frozen overlays with one plane per frozen road tile. */
  setFrozen(tiles) {
    for (const child of [...this.frozenGroup.children]) this.frozenGroup.remove(child);
    for (const { x, y, multiplier } of tiles) {
      const plane = new THREE.Mesh(this.frozenGeometry, this.frozenMaterial);
      plane.rotation.x = -Math.PI / 2;
      const w = this.grid.tileToWorld(x, y);
      plane.position.set(w.x, 0.02, w.z);
      plane.userData.multiplier = multiplier;
      this.frozenGroup.add(plane);
    }
  }

  update(dt) {
    this.time += dt;
    this.frozenMaterial.opacity = 0.45 + 0.15 * Math.sin(this.time * 2.5);
    for (const [i, plane] of this.frozenGroup.children.entries()) {
      plane.position.y = 0.02 + 0.015 * Math.sin(this.time * 3 + i);
    }
  }

  pickTile(raycaster) {
    const hits = raycaster.intersectObjects(this.groundMeshes, false);
    return hits.length ? hits[0].object.userData.tile : null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.frozenGeometry.dispose();
    this.frozenMaterial.dispose();
  }
}
