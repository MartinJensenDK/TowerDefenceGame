import * as THREE from 'three';
import { TILE_TOP } from './SceneManager.js';
import { towerReach } from './RangeRing.js';
import { OperatorAntics, THROW_RELEASE } from './OperatorAntics.js';
import { FlagWave } from './FlagWave.js';
import { levelColor } from '../data/levelColors.js';

const FIRE_ANIM = 0.25;
const SPIKE_ANIM = 0.4;

/**
 * Parts painted in the level colour, together with the flag: the crossbow's bow limbs and fletching,
 * the spikes, the cannon barrel and the frost operator's bucket. Names are matched after the glTF
 * loader has stripped Blender's ".001" dots.
 */
const WEAPON_PARTS = {
  crossbow: /^(Limb|LimbCap|Fletch)\d*$/,
  spike: /^Spike\d*$/,
  cannon: /^(Barrel|Breech|Cascabel)\d*$/,
  frozen: /^Operator_Bucket\d*$/,
};

function lerpAngle(a, b, t) {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

/** Visual for one placed tower: turret aiming, squash-and-stretch on fire, spikes, waving flag, level colour on flag and weapon. */
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
    this.levelMaterials = this.#collectLevelMaterials();
    this.setLevel(tower.level);
    scene.add(this.root);
  }

  /** Private copies of the flag and weapon materials so each tower can wear its own level colour. */
  #collectLevelMaterials() {
    const weapon = WEAPON_PARTS[this.tower.type] ?? null;
    const mats = [];
    this.root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const isFlag = o.name === 'Flag';
      if (!isFlag && !weapon?.test(o.name)) return;
      // the flag's material was already cloned by FlagWave; clone everything else here
      if (!(isFlag && this.flagWave)) o.material = o.material.clone();
      mats.push(o.material);
    });
    return mats;
  }

  /** Paints the flag and the weapon in the colour of `level` (0-based). */
  setLevel(level) {
    const color = levelColor(level);
    for (const m of this.levelMaterials) m.color.set(color);
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
    this.antics?.update(dt);
    this.flagWave?.update(this.time);
  }

  dispose() {
    this.antics?.dispose();
    this.flagWave?.dispose();
    this.scene.remove(this.root);
    for (const m of this.levelMaterials) {
      if (m !== this.flagWave?.flag.material) m.dispose();
    }
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
