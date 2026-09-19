import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneWithSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { buildPlaceholder } from './placeholders.js';

export const MODEL_NAMES = [
  'tower_crossbow', 'tower_spike', 'tower_cannon', 'tower_frozen',
  'troll_scout', 'troll_brute', 'troll_bat', 'troll_boss',
  'decor_tree', 'decor_rock', 'decor_cactus', 'decor_reed',
  'base_castle', 'spawn_gate',
];

function prepareGltfScene(scene) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    o.material = new THREE.MeshToonMaterial({
      color: old?.color ? old.color.clone() : new THREE.Color(0xffffff),
      map: old?.map ?? null,
      vertexColors: !!old?.vertexColors,
      transparent: !!old?.transparent,
      opacity: old?.opacity ?? 1,
    });
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return scene;
}

/**
 * Loads .glb files from /models and falls back to procedural placeholders.
 * Call preload() once, then instantiate() synchronously as often as needed.
 */
export class ModelLibrary {
  constructor({ basePath = '/models/' } = {}) {
    this.basePath = basePath;
    this.loader = new GLTFLoader();
    this.entries = new Map();
    this.pending = new Map();
  }

  async preload(names = MODEL_NAMES) {
    await Promise.all(names.map((n) => this.load(n)));
  }

  load(name) {
    if (this.entries.has(name)) return Promise.resolve(this.entries.get(name));
    if (this.pending.has(name)) return this.pending.get(name);
    const url = `${this.basePath}${name}.glb`;
    const promise = fetch(url, { method: 'HEAD' })
      .then((res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!res.ok || type.includes('text/html')) throw new Error(`no file at ${url}`);
        return this.loader.loadAsync(url);
      })
      .then((gltf) => ({ name, template: prepareGltfScene(gltf.scene), clips: gltf.animations ?? [], source: 'glb' }))
      .catch((err) => {
        console.warn(`[models] ${name}: using placeholder (${err?.message ?? err})`);
        return { name, template: buildPlaceholder(name), clips: [], source: 'placeholder' };
      })
      .then((entry) => {
        this.entries.set(name, entry);
        this.pending.delete(name);
        return entry;
      });
    this.pending.set(name, promise);
    return promise;
  }

  get(name) {
    let entry = this.entries.get(name);
    if (!entry) {
      entry = { name, template: buildPlaceholder(name), clips: [], source: 'placeholder' };
      this.entries.set(name, entry);
    }
    return entry;
  }

  /** Fresh copy of a model. Materials are shared; clone them yourself if you tint per instance. */
  instantiate(name) {
    const entry = this.get(name);
    const root = cloneWithSkeleton(entry.template);
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return {
      root,
      turret: root.getObjectByName('Turret') ?? root,
      muzzle: root.getObjectByName('Muzzle') ?? null,
      clips: entry.clips,
      source: entry.source,
    };
  }
}
