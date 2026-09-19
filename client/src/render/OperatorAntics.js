import * as THREE from 'three';

const OPERATOR_SCALE = 1.45;
const FIRE_QUIET = 1.2; // seconds after a shot before the operator starts fooling around again
const IDLE_MIN = 2.5;
const IDLE_MAX = 6.5;

/** Smooth 0→1→0 envelope over a phase 0..1. */
const bump = (t) => Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);

const ANTICS = ['jump', 'spin', 'nose', 'fart', 'wave', 'dance', 'scratch'];

/**
 * Idle antics for the little operator troll on a tower: hops, spins, nose picking, a fart with a
 * green puff, waving, dancing and head scratching. Purely cosmetic; pauses while the tower fires.
 */
export class OperatorAntics {
  constructor(operator, { effects = null } = {}) {
    this.op = operator;
    this.effects = effects;
    this.op.scale.multiplyScalar(OPERATOR_SCALE);
    this.basePos = this.op.position.clone();
    this.baseQuat = this.op.quaternion.clone();
    this.baseScale = this.op.scale.clone();
    const byName = (re) => {
      const out = [];
      this.op.traverse((o) => {
        if (o !== this.op && re.test(o.name)) out.push(o);
      });
      return out;
    };
    // arms/hands are siblings named Operator_Arm / Operator_Arm.001 (loader strips the dot); +x is the troll's right
    this.head = byName(/^Operator_Head/)[0] ?? null;
    this.rightArm = byName(/^Operator_Arm/).find((o) => o.position.x > 0) ?? null;
    this.rightHand = byName(/^Operator_Hand/).find((o) => o.position.x > 0) ?? null;
    this.leftArm = byName(/^Operator_Arm/).find((o) => o.position.x < 0) ?? null;
    this.leftHand = byName(/^Operator_Hand/).find((o) => o.position.x < 0) ?? null;
    this.pupils = byName(/^Operator_Pupil/);
    this.parts = [this.head, this.rightArm, this.rightHand, this.leftArm, this.leftHand, ...this.pupils].filter(Boolean);
    this.rest = new Map(this.parts.map((o) => [o, { p: o.position.clone(), q: o.quaternion.clone() }]));
    this.nose = byName(/^Operator_Nose/)[0]?.position.clone() ?? new THREE.Vector3(0, 0.45, 0.12);
    this.lastFire = -Infinity;
    this.time = 0;
    this.current = null;
    this.t = 0;
    this.duration = 0;
    this.nextAt = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    this.puffed = false;
    this.tmp = new THREE.Vector3();
    this.q = new THREE.Quaternion();
  }

  noteFire() {
    this.lastFire = this.time;
  }

  #restore() {
    this.op.position.copy(this.basePos);
    this.op.quaternion.copy(this.baseQuat);
    this.op.scale.copy(this.baseScale);
    for (const [o, r] of this.rest) {
      o.position.copy(r.p);
      o.quaternion.copy(r.q);
    }
  }

  #start(name) {
    this.current = name;
    this.t = 0;
    this.puffed = false;
    this.duration = { jump: 1.4, spin: 0.9, nose: 2.0, fart: 1.5, wave: 1.6, dance: 2.0, scratch: 1.8 }[name];
  }

  /** Raises an arm (rotation about the troll's X axis, in the operator's space) and drags its hand along. */
  #raiseArm(arm, hand, amount, side = 1) {
    if (!arm) return;
    const r = this.rest.get(arm);
    this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -amount);
    arm.quaternion.copy(r.q).premultiply(this.q);
    if (hand) {
      const hr = this.rest.get(hand);
      // the hand sits ~0.07 below the arm centre; swing it on the same arc
      hand.position.set(hr.p.x - side * 0.02 * amount, r.p.y + Math.cos(amount) * (hr.p.y - r.p.y) * 0.5 + Math.sin(amount) * 0.08, r.p.z + Math.sin(amount) * 0.14);
    }
  }

  update(dt) {
    this.time += dt;
    const quiet = this.time - this.lastFire > FIRE_QUIET;
    if (!this.current) {
      if (quiet && this.time >= this.nextAt) this.#start(ANTICS[Math.floor(Math.random() * ANTICS.length)]);
      else return;
    }
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    this.#restore();
    const e = bump(k);
    switch (this.current) {
      case 'jump': {
        const hop = Math.abs(Math.sin(k * Math.PI * 3));
        this.op.position.y = this.basePos.y + hop * 0.22 * e;
        this.op.scale.set(this.baseScale.x * (1 - 0.08 * hop), this.baseScale.y * (1 + 0.14 * hop), this.baseScale.z * (1 - 0.08 * hop));
        break;
      }
      case 'spin': {
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * k * Math.PI * 2);
        this.op.quaternion.copy(this.baseQuat).multiply(this.q);
        this.op.position.y = this.basePos.y + e * 0.18;
        break;
      }
      case 'nose': {
        // hand up to the nose, a little wiggle, head tilts, eyes cross
        this.#raiseArm(this.rightArm, this.rightHand, e * 1.6);
        if (this.rightHand) {
          const wig = Math.sin(this.t * 22) * 0.01 * e;
          this.rightHand.position.lerp(this.tmp.set(this.nose.x + 0.05, this.nose.y - 0.02 + wig, this.nose.z + 0.05), e);
        }
        if (this.head) this.head.quaternion.copy(this.rest.get(this.head).q).premultiply(this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.2 * e));
        for (const p of this.pupils) p.position.x += (p.position.x > 0 ? -1 : 1) * 0.012 * e;
        break;
      }
      case 'fart': {
        // crouch and lean forward, let one go, then look around innocently
        const crouch = bump(Math.min(1, k * 2));
        this.op.scale.y = this.baseScale.y * (1 - 0.16 * crouch);
        this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25 * crouch);
        this.op.quaternion.copy(this.baseQuat).multiply(this.q);
        if (!this.puffed && k > 0.4) {
          this.puffed = true;
          const rear = this.op.localToWorld(this.tmp.set(0.08, 0.22, -0.16));
          this.effects?.puff(rear, '#9bd44a');
          this.effects?.hitSprite(this.op.localToWorld(this.tmp.set(0, 0.7, 0)), 'Prrrt!', '#9bd44a', 0.7);
        }
        if (this.head && k > 0.5) {
          const look = Math.sin((k - 0.5) * Math.PI * 4) * 0.6;
          this.head.quaternion.copy(this.rest.get(this.head).q).premultiply(this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), look));
        }
        break;
      }
      case 'wave': {
        this.#raiseArm(this.rightArm, this.rightHand, e * 2.4 + Math.sin(this.t * 14) * 0.25 * e);
        break;
      }
      case 'dance': {
        const sway = Math.sin(this.t * 9) * 0.22 * e;
        this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sway);
        this.op.quaternion.copy(this.baseQuat).multiply(this.q);
        this.op.position.y = this.basePos.y + Math.abs(Math.sin(this.t * 9)) * 0.06 * e;
        this.#raiseArm(this.rightArm, this.rightHand, (1 + Math.sin(this.t * 9)) * 0.7 * e);
        this.#raiseArm(this.leftArm, this.leftHand, (1 - Math.sin(this.t * 9)) * 0.7 * e, -1);
        break;
      }
      case 'scratch': {
        this.#raiseArm(this.rightArm, this.rightHand, e * 2.6);
        if (this.rightHand) {
          const head = this.head ? this.head.position : this.nose;
          this.rightHand.position.lerp(this.tmp.set(head.x + 0.1, head.y + 0.16 + Math.sin(this.t * 18) * 0.015 * e, head.z - 0.02), e);
        }
        if (this.head) this.head.quaternion.copy(this.rest.get(this.head).q).premultiply(this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.25 * e));
        break;
      }
      default:
        break;
    }
    if (k >= 1) {
      this.#restore();
      this.current = null;
      this.nextAt = this.time + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    }
  }
}
