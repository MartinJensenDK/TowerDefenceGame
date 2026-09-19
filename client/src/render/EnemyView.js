import * as THREE from 'three';
import { HP_STEPS, hpTexture } from './hpBar.js';

const DEATH_DURATION = 0.45;
const DEFAULT_CADENCE = 9;
const LIMB_RE = /^(Leg|Arm)(L|R)(\d*)$/;
/** Visual for one enemy: model instance, walk bobbing, hp bar, hit flash and death squash. */
export class EnemyView {
  constructor(enemy, models, scene) {
    this.enemy = enemy;
    this.scene = scene;
    const inst = models.instantiate(`troll_${enemy.type}`);
    this.root = inst.root;
    this.materials = [];
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        this.materials.push(o.material);
      }
    });
    this.wings = [this.root.getObjectByName('WingL'), this.root.getObjectByName('WingR')].filter(Boolean);
    // Hip and shoulder pivots (see docs/model-contract.md) swing while the troll runs. A mount has
    // two numbered pairs (LegL/LegR in front, LegL001/LegR001 behind) that move as diagonal pairs.
    this.legs = [];
    this.arms = [];
    this.root.traverse((o) => {
      const m = LIMB_RE.exec(o.name);
      if (!m) return;
      const sign = (m[2] === 'L' ? 1 : -1) * (Number(m[3] || 0) % 2 ? -1 : 1);
      (m[1] === 'Leg' ? this.legs : this.arms).push({ pivot: o, sign });
    });
    for (const m of this.materials) {
      m.userData.baseEmissive = m.emissive?.getHex() ?? 0;
      m.emissiveIntensity = Math.min(1.2, m.emissiveIntensity ?? 1); // Blender strengths of 3-4 would wash out to white
      m.userData.baseIntensity = m.emissiveIntensity;
    }
    this.glowing = this.materials.filter((m) => /glow|flame|fire/i.test(m.name) && m.userData.baseEmissive);
    this.height = new THREE.Box3().setFromObject(this.root).max.y;
    this.cadence = enemy.def.cadence ?? DEFAULT_CADENCE; // walk cycles per second at full speed
    this.bob = Math.max(0.06, this.height * 0.05); // the Troll King's steps have to be felt

    // Optional glTF animation clips (see docs/model-contract.md): walk loops, die plays once.
    this.mixer = null;
    this.actions = {};
    if (inst.clips.length) {
      this.mixer = new THREE.AnimationMixer(this.root);
      for (const clip of inst.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
      this.actions.walk?.play();
    }

    // One billboard sprite for the whole hp bar, so it stays a single bar whichever way the troll faces.
    this.hpLevel = HP_STEPS;
    this.hpBar = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTexture(HP_STEPS), transparent: true, depthTest: false }));
    this.hpBar.scale.set(1.1, 0.17, 1);
    this.hpBar.position.y = this.height + 0.35;
    this.hpBar.renderOrder = 10;
    this.root.add(this.hpBar);

    this.walkT = Math.random() * 10;
    this.glowT = Math.random() * 10;
    this.flashT = 0;
    this.dying = false;
    this.deathT = 0;
    this.syncTransform();
    scene.add(this.root);
  }

  syncTransform() {
    this.root.position.set(this.enemy.x, 0, this.enemy.z);
    this.root.rotation.set(0, this.enemy.heading, 0);
  }

  worldPosition(target = new THREE.Vector3()) {
    return target.set(this.enemy.x, this.height * 0.6, this.enemy.z);
  }

  flash() {
    this.flashT = 0.08;
  }

  startDeath() {
    this.dying = true;
    this.hpBar.visible = false;
    if (this.actions.die) {
      this.actions.walk?.stop();
      const die = this.actions.die;
      die.reset();
      die.setLoop(THREE.LoopOnce, 1);
      die.clampWhenFinished = true;
      die.play();
    }
  }

  /** Returns true when a death animation has finished and the view can be removed. */
  update(dt) {
    this.mixer?.update(dt);
    if (this.dying) {
      this.deathT += dt;
      if (this.actions.die) return this.deathT >= this.actions.die.getClip().duration;
      const t = Math.min(1, this.deathT / DEATH_DURATION);
      this.root.rotation.y += dt * 16;
      this.root.scale.set(1 + t * 0.6, Math.max(0.05, 1 - t), 1 + t * 0.6);
      return t >= 1;
    }
    this.syncTransform();
    const hacking = !!this.enemy.blockedBy;
    this.walkT += dt * (hacking ? 14 : this.cadence * this.enemy.speedMultiplier);
    const s = Math.sin(this.walkT);
    this.glowT += dt;
    for (const m of this.glowing) m.emissiveIntensity = m.userData.baseIntensity * (0.75 + 0.25 * Math.sin(this.glowT * 7 + m.id) * Math.sin(this.glowT * 11));
    if (this.actions.walk) this.actions.walk.timeScale = hacking ? 0 : this.enemy.speedMultiplier;
    else if (hacking && (this.legs.length || this.arms.length)) {
      // stopped at a barricade: one foot forward, both arms swing from over the head down onto it,
      // the body leans into each blow (absolute angles: syncTransform() reset the root every frame)
      const k = (s + 1) / 2; // 0 = wound up over the head, 1 = weapon down on the barricade
      const strike = k * k; // slow wind-up, fast hit
      for (const leg of this.legs) leg.pivot.rotation.x = leg.sign * 0.35;
      for (const arm of this.arms) arm.pivot.rotation.x = -2.3 + strike * 3.0;
      this.root.rotation.x = 0.28 * strike - 0.08;
      this.root.position.y += (1 - strike) * 0.04;
      this.root.scale.set(1, 1 - 0.04 * strike, 1);
    } else if (this.legs.length || this.arms.length) {
      // running: legs swing opposite each other, each arm swings opposite its own leg, body bobs twice per stride
      const flying = this.enemy.flying;
      const swing = flying ? 0.25 : 0.7;
      for (const leg of this.legs) leg.pivot.rotation.x = leg.sign * s * swing;
      for (const arm of this.arms) arm.pivot.rotation.x = -arm.sign * s * swing * 0.8;
      this.root.position.y += flying ? 0 : Math.abs(Math.sin(this.walkT)) * this.bob;
      this.root.scale.set(1, 1 + 0.02 * s, 1);
    } else this.root.scale.set(1 - 0.04 * s, 1 + 0.07 * s, 1 - 0.04 * s);
    this.wings.forEach((w, i) => {
      w.rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.walkT * 2) * 0.6;
    });
    const level = Math.max(0, Math.min(HP_STEPS, Math.ceil((this.enemy.hp / this.enemy.maxHp) * HP_STEPS)));
    if (level !== this.hpLevel) {
      this.hpLevel = level;
      this.hpBar.material.map = hpTexture(level);
      this.hpBar.material.needsUpdate = true;
    }

    this.flashT = Math.max(0, this.flashT - dt);
    const slowed = this.enemy.speedMultiplier < 1;
    for (const m of this.materials) {
      if (!m.emissive) continue;
      const base = m.userData.baseEmissive;
      m.emissive.setHex(this.flashT > 0 ? 0xffffff : base || (slowed ? 0x2266cc : 0x000000));
    }
    return false;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
    this.hpBar.material.dispose(); // textures are shared and kept
  }
}
