import * as THREE from 'three';
import { TILE_TOP } from './SceneManager.js';
import { towerReach } from './RangeRing.js';
import { OperatorAntics, THROW_RELEASE } from './OperatorAntics.js';
import { FlagWave } from './FlagWave.js';

const FIRE_ANIM = 0.25;
const SPIKE_ANIM = 0.4;
const STARS_PER_ROW = 5;

function lerpAngle(a, b, t) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/** Visual for one placed tower: turret aiming, squash-and-stretch on fire, spikes, waving flag, level stars. */
export class TowerView {
  constructor(tower, models, scene, effects = null) {
    this.tower = tower;
    this.scene = scene;
    this.effects = effects;
    this.time = 0;
    this.pendingThrow = null;
    const inst = models.instantiate(`tower_${tower.type}`);
    this.root = inst.root;
    this.turret = inst.turret;
    this.muzzle = inst.muzzle;
    this.turretBaseZ = this.turret.position.z;
    this.root.position.set(tower.x, TILE_TOP, tower.z);
    this.spikes = [];
    this.root.traverse((o) => {
      if (/^Spike\.?\d*$/.test(o.name)) this.spikes.push({ mesh: o, baseY: o.position.y });
    });
    this.animT = 0;
    this.spikeT = 0;
    const operator = this.root.getObjectByName('Operator');
    this.antics = operator ? new OperatorAntics(operator, { effects }) : null;
    this.flagWave = FlagWave.attach(this.root);
    // Optional glTF clips: idle loops, shoot plays once per shot (replaces the squash).
    this.mixer = null;
    this.actions = {};
    if (inst.clips.length) {
      this.mixer = new THREE.AnimationMixer(this.root);
      for (const clip of inst.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.actions.idle?.play();
    }
    this.stars = new THREE.Group();
    this.root.add(this.stars);
    this.starGeo = new THREE.SphereGeometry(0.11, 8, 6);
    this.starMat = new THREE.MeshToonMaterial({ color: 0xffd23f });
    this.setLevel(tower.level);
    scene.add(this.root);
  }

  /** One gold star per upgrade above the model, in rows of five so level 10 still fits over a tile. */
  setLevel(level) {
    for (const c of [...this.stars.children]) this.stars.remove(c);
    const top = new THREE.Box3().setFromObject(this.root).max.y - TILE_TOP + 0.35;
    const rows = Math.ceil(level / STARS_PER_ROW);
    for (let i = 0; i < level; i++) {
      const row = Math.floor(i / STARS_PER_ROW);
      const inRow = Math.min(STARS_PER_ROW, level - row * STARS_PER_ROW);
      const col = i - row * STARS_PER_ROW;
      const s = new THREE.Mesh(this.starGeo, this.starMat);
      s.position.set((col - (inRow - 1) / 2) * 0.3, top + (rows - 1 - row) * 0.28, 0);
      this.stars.add(s);
    }
  }

  /** Frozen tower: the operator turns to the target and flings a bucket of cold water at it. */
  playThrow(target) {
    if (!this.antics || !this.effects) return;
    this.antics.throwAt(this.tower.facing);
    this.pendingThrow = { target, t: THROW_RELEASE };
  }

  playFire() {
    if (this.actions.shoot) {
      const shoot = this.actions.shoot;
      shoot.reset();
      shoot.setLoop(THREE.LoopOnce, 1);
      shoot.play();
    } else {
      this.animT = FIRE_ANIM;
    }
    if (this.tower.type === 'spike') this.spikeT = SPIKE_ANIM;
    this.antics?.noteFire();
  }

  muzzleWorldPosition(target = new THREE.Vector3()) {
    (this.muzzle ?? this.turret).getWorldPosition(target);
    if (!this.muzzle) target.y += 1.2;
    return target;
  }

  update(dt) {
    this.time += dt;
    this.mixer?.update(dt);
    if (this.pendingThrow) {
      this.pendingThrow.t -= dt;
      if (this.pendingThrow.t <= 0) {
        this.effects.spawnWater({ from: this.antics.handWorldPosition(new THREE.Vector3()), target: this.pendingThrow.target });
        this.pendingThrow = null;
      }
    }
    if (this.turret !== this.root) {
      this.turret.rotation.y = lerpAngle(this.turret.rotation.y, this.tower.facing, 1 - Math.exp(-dt * 12));
    }
    if (this.animT > 0) {
      this.animT = Math.max(0, this.animT - dt);
      const t = 1 - this.animT / FIRE_ANIM;
      const s = Math.sin(t * Math.PI);
      this.root.scale.set(1 + 0.12 * s, 1 - 0.18 * s, 1 + 0.12 * s);
      if (this.tower.type === 'cannon') this.turret.position.z = this.turretBaseZ - 0.35 * s;
    } else {
      this.root.scale.set(1, 1, 1);
      if (this.tower.type === 'cannon') this.turret.position.z = this.turretBaseZ;
    }
    if (this.spikeT > 0) {
      this.spikeT = Math.max(0, this.spikeT - dt);
      const t = 1 - this.spikeT / SPIKE_ANIM;
      const lift = Math.sin(t * Math.PI) * 0.45;
      for (const s of this.spikes) s.mesh.position.y = s.baseY + lift;
    }
    this.stars.rotation.y += dt * 1.5;
    this.antics?.update(dt);
    this.flagWave?.update(this.time);
  }

  dispose() {
    this.antics?.dispose();
    this.flagWave?.dispose();
    this.scene.remove(this.root);
    this.starGeo.dispose();
    this.starMat.dispose();
  }
}

/** Translucent preview of a tower plus its range ring. */
export function makeGhost(models, type, def) {
  const { root } = models.instantiate(`tower_${type}`);
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.5;
      o.castShadow = false;
    }
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);
  ring.scale.setScalar(towerReach(def, def.levels[0]));
  return {
    root,
    ring,
    setOk(ok) {
      ringMat.color.setHex(ok ? 0x66ff66 : 0xff5555);
      root.traverse((o) => {
        if (o.isMesh && o !== ring) o.material.color.setHex(ok ? 0xffffff : 0xff8888);
      });
    },
    dispose() {
      root.traverse((o) => {
        if (o.isMesh) o.material.dispose();
      });
      ring.geometry.dispose();
    },
  };
}
