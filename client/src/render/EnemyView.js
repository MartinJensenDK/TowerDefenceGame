import * as THREE from 'three';

const DEATH_DURATION = 0.45;
const HP_STEPS = 32;
const hpTextures = new Map();

/** Shared hp-bar textures: one per (fill level, colour), drawn once and reused by every troll. */
function hpTexture(level) {
  if (hpTextures.has(level)) return hpTextures.get(level);
  const w = 66;
  const h = 10;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1d1a16';
  ctx.fillRect(0, 0, w, h);
  const ratio = level / HP_STEPS;
  ctx.fillStyle = ratio > 0.5 ? '#44dd44' : ratio > 0.25 ? '#ffb347' : '#ff5544';
  ctx.fillRect(2, 2, Math.round((w - 4) * ratio), h - 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  hpTextures.set(level, tex);
  return tex;
}

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
    // Hip and shoulder pivots (see docs/model-contract.md) swing while the troll runs.
    this.legs = [this.root.getObjectByName('LegL'), this.root.getObjectByName('LegR')].filter(Boolean);
    this.arms = [this.root.getObjectByName('ArmL'), this.root.getObjectByName('ArmR')].filter(Boolean);
    this.height = new THREE.Box3().setFromObject(this.root).max.y;

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
    this.flashT = 0;
    this.dying = false;
    this.deathT = 0;
    this.syncTransform();
    scene.add(this.root);
  }

  syncTransform() {
    this.root.position.set(this.enemy.x, 0, this.enemy.z);
    this.root.rotation.y = this.enemy.heading;
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
    this.walkT += dt * 9 * this.enemy.speedMultiplier;
    const s = Math.sin(this.walkT);
    if (this.actions.walk) this.actions.walk.timeScale = this.enemy.speedMultiplier;
    else if (this.legs.length || this.arms.length) {
      // running: legs swing opposite each other, each arm swings opposite its own leg, body bobs twice per stride
      const flying = this.enemy.flying;
      const swing = flying ? 0.25 : 0.7;
      this.legs.forEach((leg, i) => {
        leg.rotation.x = (i === 0 ? 1 : -1) * s * swing;
      });
      this.arms.forEach((arm, i) => {
        arm.rotation.x = (i === 0 ? -1 : 1) * s * swing * 0.8;
      });
      this.root.position.y += flying ? 0 : Math.abs(Math.sin(this.walkT)) * 0.06;
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
    const emissive = this.flashT > 0 ? 0xffffff : slowed ? 0x2266cc : 0x000000;
    for (const m of this.materials) if (m.emissive) m.emissive.setHex(emissive);
    return false;
  }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.materials) m.dispose();
    this.hpBar.material.dispose(); // textures are shared and kept
  }
}
