import * as THREE from 'three';
import { FlagWave } from './FlagWave.js';
import { TILE_SIZE, TILE } from '../game/Grid.js';
import { TILE_TOP } from './SceneManager.js';
import { makeRoadTexture } from './roadTexture.js';

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
    this.flagWave = null;
    this.frozenMaterial = new THREE.MeshToonMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.55, depthWrite: false });
    this.frozenGeometry = new THREE.PlaneGeometry(TILE_SIZE * 0.96, TILE_SIZE * 0.96);

    this.#buildTiles();
    this.#buildPebbles();
    this.#buildDecor();
    this.#buildProps();
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
    mats.castle = new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.road).multiplyScalar(0.85) });
    // cobblestones: the box's UVs run 0..1 per face, so the texture tiles once per road tile
    this.roadTexture = makeRoadTexture(hashString(this.map.id));
    if (this.roadTexture) {
      mats.road.map = this.roadTexture;
      mats.castle.map = this.roadTexture;
    }
    this.ownedGeometries.push(box);
    this.ownedMaterials.push(mats.g0, mats.g1, mats.road, mats.water, mats.castle);

    // One InstancedMesh per material: the kind decides both material and tile top.
    const tops = { road: 0, castle: 0, water: -0.2, g0: TILE_TOP, g1: TILE_TOP };
    const kindOf = (x, y, type) => {
      if (type === TILE.ROAD) return 'road';
      if (type === TILE.WATER) return 'water';
      if (type === TILE.CASTLE) return 'castle';
      return (x + y) % 2 ? 'g0' : 'g1';
    };
    const counts = { g0: 0, g1: 0, road: 0, water: 0, castle: 0 };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) counts[kindOf(x, y, tiles[y][x])] += 1;
    }
    const instanced = {};
    for (const [kind, count] of Object.entries(counts)) {
      if (!count) continue;
      const im = new THREE.InstancedMesh(box, mats[kind], count);
      im.name = `tiles_${kind}`;
      im.receiveShadow = true;
      im.castShadow = kind !== 'water';
      im.userData.tiles = [];
      instanced[kind] = im;
      this.group.add(im);
      this.groundMeshes.push(im);
    }
    const matrix = new THREE.Matrix4();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const type = tiles[y][x];
        const kind = kindOf(x, y, type);
        const im = instanced[kind];
        const i = im.userData.tiles.length;
        im.setMatrixAt(i, matrix.makeTranslation((x + 0.5) * TILE_SIZE, tops[kind] - TILE_THICKNESS / 2, (y + 0.5) * TILE_SIZE));
        im.userData.tiles[i] = { x, y, type };
      }
    }
    for (const im of Object.values(instanced)) im.instanceMatrix.needsUpdate = true;
    const slabGeometry = new THREE.BoxGeometry(width * TILE_SIZE + 1.5, 1.6, height * TILE_SIZE + 1.5);
    const slabMaterial = new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.ground[1]).multiplyScalar(0.55) });
    this.ownedGeometries.push(slabGeometry);
    this.ownedMaterials.push(slabMaterial);
    const slab = new THREE.Mesh(slabGeometry, slabMaterial);
    slab.position.set(this.centerX, -TILE_THICKNESS - 0.8, this.centerZ);
    slab.receiveShadow = true;
    this.group.add(slab);
  }

  /** Small stones scattered along the road edges: one InstancedMesh for the whole map. */
  #buildPebbles() {
    const { width, height, tiles } = this.map;
    const rng = makeRng(hashString(this.map.id + ':pebbles'));
    const spots = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] !== TILE.ROAD) continue;
        const n = rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
        for (let i = 0; i < n; i++) {
          // hug one of the four tile edges so the stones read as road-side rubble
          const side = Math.floor(rng() * 4);
          const along = (rng() - 0.5) * 1.6;
          const edge = 0.78 + rng() * 0.12;
          const ox = side === 0 ? -edge : side === 1 ? edge : along;
          const oz = side === 2 ? -edge : side === 3 ? edge : along;
          spots.push({ x: (x + 0.5) * TILE_SIZE + ox, z: (y + 0.5) * TILE_SIZE + oz, s: 0.08 + rng() * 0.1, r: rng() * Math.PI });
        }
      }
    }
    if (!spots.length) return;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshToonMaterial({ color: new THREE.Color(this.theme.road).multiplyScalar(0.62) });
    this.ownedGeometries.push(geo);
    this.ownedMaterials.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((p, i) => {
      q.setFromAxisAngle(up, p.r);
      m.compose(new THREE.Vector3(p.x, p.s * 0.5, p.z), q, new THREE.Vector3(p.s, p.s * 0.7, p.s));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.pebbles = mesh;
    this.group.add(mesh);
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

  /** Big scenery from `map.props` (e.g. the mountain ridge): each model is stretched to its w x h tile footprint. */
  #buildProps() {
    for (const prop of this.map.props ?? []) {
      const { root } = this.models.instantiate(prop.model);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      const targetW = prop.w * TILE_SIZE;
      const targetD = prop.h * TILE_SIZE;
      if (size.x > 0 && size.z > 0) root.scale.set(targetW / size.x, Math.min(targetW / size.x, targetD / size.z), targetD / size.z);
      root.position.set((prop.x + prop.w / 2) * TILE_SIZE, TILE_TOP, (prop.y + prop.h / 2) * TILE_SIZE);
      root.rotation.y = ((prop.rotation ?? 0) * Math.PI) / 180;
      this.group.add(root);
    }
  }

  #buildLandmarks() {
    const [bx, by] = this.map.base;
    const base = this.models.instantiate('base_castle').root;
    const bw = this.grid.tileToWorld(bx, by);
    base.position.set(bw.x, 0, bw.z);
    // The castle gate faces local +Z, so aim +Z back down the road the enemies arrive on.
    const mainPath = this.map.paths?.[0];
    if (mainPath && mainPath.length >= 2) {
      const [px, py] = mainPath[mainPath.length - 2];
      base.rotation.y = Math.atan2(px - bx, py - by);
    }
    this.group.add(base);
    this.flagWave = FlagWave.attach(base);
    this.castleRoot = base;
    // Archer trolls on the walls (`Archer`, `Archer.001`, ...) stay hidden until the upgrade is bought.
    this.archers = [];
    base.traverse((o) => {
      if (/^Archer\d*$/.test(o.name)) this.archers.push(o);
    });
    this.archers.sort((a, b) => a.name.localeCompare(b.name));
    for (const a of this.archers) a.visible = false;
    this.archerTurn = 0;

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
    this.flagWave?.update(this.time);
  }

  /** Shows the first `count` archer trolls on the castle walls. */
  setArchers(count) {
    this.archers.forEach((a, i) => {
      a.visible = i < count;
    });
  }

  /** World position an arrow leaves from: the visible archers take turns. */
  nextArcherMuzzle(target = new THREE.Vector3()) {
    const visible = this.archers.filter((a) => a.visible);
    const [bx, by] = this.map.base;
    if (!visible.length) {
      const w = this.grid.tileToWorld(bx, by);
      return target.set(w.x, 2.2, w.z);
    }
    const archer = visible[this.archerTurn++ % visible.length];
    archer.getWorldPosition(target);
    target.y += 0.55;
    return target;
  }

  /** The tile under the pointer; clicking the castle model itself counts as its base tile. */
  pickTile(raycaster) {
    const hits = raycaster.intersectObjects(this.groundMeshes, false);
    const castleHits = this.castleRoot ? raycaster.intersectObject(this.castleRoot, true) : [];
    if (castleHits.length && (!hits.length || castleHits[0].distance < hits[0].distance)) {
      const [x, y] = this.map.base;
      return { x, y, type: TILE.CASTLE, castle: true };
    }
    if (!hits.length) return null;
    const { object, instanceId } = hits[0];
    return object.userData.tiles[instanceId] ?? null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const im of this.groundMeshes) im.dispose?.();
    this.pebbles?.dispose();
    this.roadTexture?.dispose();
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    this.frozenGeometry.dispose();
    this.frozenMaterial.dispose();
    this.flagWave?.dispose();
  }
}
