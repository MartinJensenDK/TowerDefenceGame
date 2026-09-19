import * as THREE from 'three';

const OPERATOR_SCALE = 1.0; // the model is already built at tower-operator size
const FIRE_QUIET = 1.2; // seconds after a shot before the operator starts fooling around again
const IDLE_MIN = 2.5;
const IDLE_MAX = 6.5;
const STAGGER = 0.7; // no two operators start an antic within this many seconds of each other

/** Smooth 0→1→0 envelope over a phase 0..1. */
const bump = (t) => Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
/** Smooth 0→1 ease over a phase 0..1. */
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, t)) * Math.PI);

const ANTICS = ['jump', 'spin', 'nose', 'fart', 'wave', 'dance', 'scratch'];
const DURATIONS = { jump: 1.4, spin: 0.9, nose: 2.4, fart: 2.6, wave: 1.6, dance: 2.0, scratch: 1.8 };

// Shared between every operator so they never do the same thing at the same time.
const playing = new Map(); // antic name -> count in progress
let lastStart = -Infinity;
let clock = 0;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Idle antics for the little operator troll on a tower: hops, spins, nose picking, a fart (hands
 * on the belly, lean over, let rip), waving, dancing and head scratching. Purely cosmetic and
 * procedural on the model's `Operator_*` parts; pauses while the tower fires.
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
    // shoulder pivots (Operator_ArmL / Operator_ArmR, loader may append digits); hands hang under them
    this.armL = byName(/^Operator_ArmL/)[0] ?? null;
    this.armR = byName(/^Operator_ArmR/)[0] ?? null;
    this.head = byName(/^Operator_Head/)[0] ?? null;
    this.pupils = byName(/^Operator_Pupil/);
    this.parts = [this.armL, this.armR, this.head, ...this.pupils].filter(Boolean);
    this.rest = new Map(this.parts.map((o) => [o, { p: o.position.clone(), q: o.quaternion.clone() }]));
    this.lastFire = -Infinity;
    this.time = 0;
    this.current = null;
    this.t = 0;
    this.duration = 0;
    this.nextAt = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    this.puffed = false;
    this.tmp = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
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

  /** Rotates a shoulder pivot: `raise` swings the arm forward/up (about X), `inward` towards the body midline (about Y). */
  #arm(pivot, raise, inward = 0, side = 1) {
    if (!pivot) return;
    const r = this.rest.get(pivot);
    this.q.setFromAxisAngle(X, -raise);
    this.q2.setFromAxisAngle(Y, inward * side);
    pivot.quaternion.copy(r.q).premultiply(this.q).premultiply(this.q2);
  }

  #headTurn(yaw = 0, tilt = 0, nod = 0) {
    if (!this.head) return;
    this.q.setFromAxisAngle(Y, yaw);
    this.q2.setFromAxisAngle(Z, tilt);
    this.head.quaternion.copy(this.rest.get(this.head).q).premultiply(this.q2).premultiply(this.q);
    if (nod) this.head.quaternion.premultiply(this.q.setFromAxisAngle(X, nod));
  }

  #lean(x = 0, z = 0) {
    this.q.setFromAxisAngle(X, x);
    this.q2.setFromAxisAngle(Z, z);
    this.op.quaternion.copy(this.baseQuat).multiply(this.q).multiply(this.q2);
  }

  #pick() {
    const free = ANTICS.filter((a) => !playing.get(a));
    if (!free.length) return null;
    return free[Math.floor(Math.random() * free.length)];
  }

  #start(name) {
    this.current = name;
    this.t = 0;
    this.puffed = false;
    this.duration = DURATIONS[name];
    playing.set(name, (playing.get(name) ?? 0) + 1);
    lastStart = clock;
  }

  #finish() {
    playing.set(this.current, Math.max(0, (playing.get(this.current) ?? 1) - 1));
    this.current = null;
    this.nextAt = this.time + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
    this.#restore();
  }

  update(dt) {
    this.time += dt;
    clock = Math.max(clock, this.time); // a shared clock that only ever moves forward
    const quiet = this.time - this.lastFire > FIRE_QUIET;
    if (!this.current) {
      if (!quiet || this.time < this.nextAt || clock - lastStart < STAGGER) return;
      const name = this.#pick();
      if (!name) return;
      this.#start(name);
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
        this.#arm(this.armL, 0.9 * hop * e, 0, -1);
        this.#arm(this.armR, 0.9 * hop * e);
        break;
      }
      case 'spin': {
        this.q.setFromAxisAngle(Y, k * k * Math.PI * 2);
        this.op.quaternion.copy(this.baseQuat).multiply(this.q);
        this.op.position.y = this.basePos.y + e * 0.18;
        this.#arm(this.armL, 1.4 * e, 0.6, -1);
        this.#arm(this.armR, 1.4 * e, 0.6);
        break;
      }
      case 'nose': {
        // right arm up so the pointing finger lands in a nostril, head tilts to meet it, eyes cross
        const up = ease(k * 3); // arrives quickly
        const dig = Math.sin(this.t * 16) * 0.08 * e; // wiggles while digging
        const hold = 1 - ease((k - 0.75) * 4); // and comes back down at the end
        const a = up * hold;
        this.#arm(this.armR, (2.35 + dig) * a, 0.75 * a);
        this.#headTurn(-0.25 * a, -0.2 * a, 0.15 * a);
        for (const p of this.pupils) p.position.x += (p.position.x > 0 ? -1 : 1) * 0.02 * a;
        break;
      }
      case 'fart': {
        // 1) both hands on the belly and a worried look  2) lean over to one side  3) let rip  4) look around innocently
        const grab = ease(k * 3);
        const lean = ease((k - 0.25) * 3) * (1 - ease((k - 0.8) * 5));
        this.#arm(this.armL, 1.0 * grab, 0.9 * grab, -1);
        this.#arm(this.armR, 1.0 * grab, 0.9 * grab);
        this.#lean(0.12 * grab, 0.45 * lean);
        this.op.scale.y = this.baseScale.y * (1 - 0.1 * grab);
        if (!this.puffed && k > 0.5) {
          this.puffed = true;
          const rear = this.op.localToWorld(this.tmp.set(0.1, 0.25, -0.18));
          this.effects?.puff(rear, '#9bd44a', 0.4);
          this.effects?.hitSprite(this.op.localToWorld(this.tmp.set(0, 0.75, 0)), 'Prrrt!', '#9bd44a', 0.6);
        }
        if (k < 0.5) this.#headTurn(0, 0, 0.25 * grab);
        else {
          const look = Math.sin((k - 0.5) * Math.PI * 4) * 0.7;
          this.#headTurn(look, 0, 0);
        }
        break;
      }
      case 'wave': {
        this.#arm(this.armR, 2.6 * e, -0.3 * e + Math.sin(this.t * 14) * 0.35 * e);
        this.#headTurn(0, 0.15 * e);
        break;
      }
      case 'dance': {
        const sway = Math.sin(this.t * 9);
        this.#lean(0, sway * 0.22 * e);
        this.op.position.y = this.basePos.y + Math.abs(sway) * 0.06 * e;
        this.#arm(this.armR, (1 + sway) * 0.9 * e, 0.3 * e);
        this.#arm(this.armL, (1 - sway) * 0.9 * e, 0.3 * e, -1);
        this.#headTurn(0, -sway * 0.15 * e);
        break;
      }
      case 'scratch': {
        const a = ease(k * 3) * (1 - ease((k - 0.75) * 4));
        this.#arm(this.armR, (2.9 + Math.sin(this.t * 18) * 0.08 * e) * a, 0.35 * a);
        this.#headTurn(0, -0.25 * a, -0.1 * a);
        break;
      }
      default:
        break;
    }
    if (k >= 1) this.#finish();
  }

  dispose() {
    if (this.current) this.#finish();
  }
}
