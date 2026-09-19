import * as THREE from 'three';

const C = {
  wood: 0x8b5a2b,
  woodDark: 0x5e3a18,
  stone: 0x9a9a9a,
  stoneDark: 0x6e6e6e,
  metal: 0x4a4a55,
  ice: 0x9fdcff,
  iceDark: 0x5fb6ee,
  troll: 0x6fbf4a,
  brute: 0x8a7a45,
  bat: 0x6a5acd,
  boss: 0xb0413e,
  skin: 0xa4e07a,
  red: 0xe0453a,
  gold: 0xffd23f,
  leaf: 0x3f9b3f,
  trunk: 0x7a4b23,
  rock: 0x9a9a9a,
  cactus: 0x4f9f4f,
  reed: 0x6e8f3a,
  eye: 0xffffff,
  pupil: 0x111111,
};

function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, ...extra });
}

function mesh(geometry, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, name = '' } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

/** A small troll that "operates" a tower. Kept tiny so the tower stays the focus. */
function operator({ x = 0, y = 0, z = 0, scale = 0.32 } = {}) {
  const g = troll({ height: 1, color: C.troll });
  g.scale.setScalar(scale);
  g.position.set(x, y, z);
  g.name = 'Operator';
  return g;
}

/** Generic cartoon troll: capsule body, round head, big ears, two eyes. */
function troll({ height, color, bulk = 1, wings = false, crown = false, hover = 0 }) {
  const g = new THREE.Group();
  const skin = toon(color);
  const r = 0.26 * height * bulk;
  const bodyLen = 0.32 * height;
  const bodyY = hover + r + bodyLen / 2;
  g.add(mesh(new THREE.CapsuleGeometry(r, bodyLen, 4, 10), skin, { y: bodyY, name: 'Body' }));

  const headR = 0.22 * height;
  const headY = bodyY + bodyLen / 2 + r * 0.6 + headR * 0.7;
  const head = mesh(new THREE.SphereGeometry(headR, 14, 12), skin, { y: headY, name: 'Head' });
  g.add(head);

  const eyeGeo = new THREE.SphereGeometry(headR * 0.22, 8, 8);
  const pupilGeo = new THREE.SphereGeometry(headR * 0.1, 6, 6);
  for (const side of [-1, 1]) {
    g.add(mesh(eyeGeo, toon(C.eye), { x: side * headR * 0.4, y: headY + headR * 0.15, z: headR * 0.8 }));
    g.add(mesh(pupilGeo, toon(C.pupil), { x: side * headR * 0.4, y: headY + headR * 0.15, z: headR * 0.98 }));
    const ear = mesh(new THREE.ConeGeometry(headR * 0.35, headR * 0.9, 6), toon(C.skin), {
      x: side * headR * 1.1,
      y: headY + headR * 0.4,
      rz: side * -1.1,
      name: side < 0 ? 'EarL' : 'EarR',
    });
    g.add(ear);
  }
  g.add(mesh(new THREE.SphereGeometry(headR * 0.28, 8, 8), toon(C.red), { y: headY - headR * 0.15, z: headR * 0.95, name: 'Nose' }));

  const footGeo = new THREE.SphereGeometry(r * 0.45, 8, 6);
  for (const side of [-1, 1]) {
    g.add(mesh(footGeo, toon(C.woodDark), { x: side * r * 0.55, y: hover + r * 0.25, z: r * 0.2, name: side < 0 ? 'FootL' : 'FootR' }));
  }

  if (wings) {
    const wingGeo = new THREE.BoxGeometry(0.6 * height, 0.05, 0.35 * height);
    for (const side of [-1, 1]) {
      const w = mesh(wingGeo, toon(0x2f2f3f), { x: side * (r + 0.28 * height), y: bodyY + r * 0.5, name: side < 0 ? 'WingL' : 'WingR' });
      g.add(w);
    }
  }

  if (crown) {
    const crownY = headY + headR * 0.95;
    g.add(mesh(new THREE.CylinderGeometry(headR * 0.62, headR * 0.55, headR * 0.35, 8), toon(C.gold), { y: crownY, name: 'Crown' }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(headR * 0.12, headR * 0.35, 4), toon(C.gold), {
        x: Math.cos(a) * headR * 0.5,
        y: crownY + headR * 0.3,
        z: Math.sin(a) * headR * 0.5,
      }));
    }
  }
  return g;
}

/** A four-legged mount (box body, four LegL/LegR pivots) with an optional small troll on its back. */
function mounted({ mountColor, mountLength, mountHeight, riderHeight, riderColor = C.troll, hover = 0 }) {
  const g = new THREE.Group();
  const body = toon(mountColor);
  const legLen = hover ? 0.2 : mountHeight * 0.8;
  const bodyY = hover + legLen + mountHeight * 0.35;
  g.add(mesh(new THREE.BoxGeometry(mountHeight * 0.9, mountHeight * 0.7, mountLength), body, { y: bodyY, name: 'MountBody' }));
  g.add(mesh(new THREE.BoxGeometry(mountHeight * 0.5, mountHeight * 0.45, mountHeight * 0.6), body, { y: bodyY + mountHeight * 0.2, z: mountLength * 0.55, name: 'MountHead' }));
  const legGeo = new THREE.BoxGeometry(mountHeight * 0.22, legLen, mountHeight * 0.22);
  [[-1, 1, 'LegL'], [1, 1, 'LegR'], [-1, -1, 'LegL001'], [1, -1, 'LegR001']].forEach(([sx, sz, name]) => {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(sx * mountHeight * 0.3, hover + legLen, sz * mountLength * 0.35);
    hip.add(mesh(legGeo, toon(0x333333), { y: -legLen / 2 }));
    g.add(hip);
  });
  if (riderHeight > 0) {
    const rider = troll({ height: riderHeight, color: riderColor });
    rider.position.y = bodyY + mountHeight * 0.3;
    rider.name = 'Rider';
    g.add(rider);
  }
  return g;
}

const BUILDERS = {
  tower_crossbow() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.2, 12), toon(C.stone), { y: 0.6 }));
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12), toon(C.stoneDark), { y: 1.2 }));
    const turret = new THREE.Group();
    turret.name = 'Turret';
    turret.position.y = 1.3;
    turret.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 1.0), toon(C.wood), { z: 0.1 }));
    turret.add(mesh(new THREE.BoxGeometry(1.3, 0.1, 0.14), toon(C.woodDark), { z: 0.55 }));
    turret.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.9), toon(C.metal), { y: 0.08, z: 0.2 }));
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    muzzle.position.set(0, 0.05, 0.7);
    turret.add(muzzle);
    turret.add(operator({ z: -0.45, y: -0.1 }));
    g.add(turret);
    return g;
  },

  tower_spike() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.5, 14), toon(C.stone), { y: 0.25 }));
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.55, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(spikeGeo, toon(C.metal), { x: Math.cos(a) * 0.6, y: 0.55, z: Math.sin(a) * 0.6, name: 'Spike' }));
    }
    g.add(operator({ y: 0.5, scale: 0.3 }));
    return g;
  },

  tower_cannon() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.7, 1.4), toon(C.wood), { y: 0.35 }));
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), toon(C.woodDark), { y: 0.72 }));
    const turret = new THREE.Group();
    turret.name = 'Turret';
    turret.position.y = 1.05;
    turret.add(mesh(new THREE.SphereGeometry(0.38, 12, 10), toon(C.metal), { z: -0.25 }));
    turret.add(mesh(new THREE.CylinderGeometry(0.26, 0.32, 1.2, 14), toon(C.metal), { z: 0.35, rx: Math.PI / 2 }));
    turret.add(mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 16), toon(C.gold), { z: 0.92 }));
    const muzzle = new THREE.Object3D();
    muzzle.name = 'Muzzle';
    muzzle.position.set(0, 0, 1.0);
    turret.add(muzzle);
    turret.add(operator({ x: 0.5, y: -0.25, z: -0.4, scale: 0.28 }));
    g.add(turret);
    return g;
  },

  tower_frozen() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.06, 18), toon(C.ice, { transparent: true, opacity: 0.6 }), { y: 0.03, name: 'Puddle' }));
    g.add(mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), toon(C.ice, { transparent: true, opacity: 0.8 }), { y: 0.7 }));
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toon(C.iceDark), { y: 0.7, ry: 0.5 }));
    g.add(mesh(new THREE.ConeGeometry(0.12, 0.35, 6), toon(C.ice), { x: 0.3, y: 0.05, z: 0.5, rx: Math.PI }));
    g.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 6), toon(C.ice), { x: -0.4, y: 0.05, z: -0.3, rx: Math.PI }));
    const op = operator({ y: 1.35, scale: 0.3 });
    op.rotation.z = 0.12;
    g.add(op);
    return g;
  },

  troll_scout: () => troll({ height: 1.0, color: C.troll }),
  troll_brute: () => troll({ height: 1.8, color: C.brute, bulk: 1.35 }),
  troll_bat: () => troll({ height: 0.8, color: C.bat, wings: true, hover: 1.2 }),
  troll_boss: () => troll({ height: 3.0, color: C.boss, bulk: 1.25, crown: true }),
  troll_archer() {
    const g = troll({ height: 1.0, color: C.troll });
    g.add(mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 12, Math.PI), toon(C.wood), { x: -0.4, y: 0.6, rz: -Math.PI / 2, name: 'Bow' }));
    return g;
  },
  troll_knight() {
    const g = troll({ height: 1.3, color: C.metal, bulk: 1.15 });
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.9, 0.16), toon(0xd0d0d8), { x: 0.5, y: 0.9, name: 'Sword' }));
    return g;
  },
  troll_wolfrider: () => mounted({ mountColor: 0x7a7a80, mountLength: 1.3, mountHeight: 0.55, riderHeight: 0.8 }),
  troll_eaglerider() {
    const g = mounted({ mountColor: 0x8a5a2b, mountLength: 1.1, mountHeight: 0.35, riderHeight: 0.7, hover: 1.2 });
    const wingGeo = new THREE.BoxGeometry(1.2, 0.05, 0.5);
    for (const side of [-1, 1]) g.add(mesh(wingGeo, toon(0x6e4520), { x: side * 0.9, y: 1.55, name: side < 0 ? 'WingL' : 'WingR' }));
    return g;
  },
  troll_rhino() {
    const g = mounted({ mountColor: 0x8c8c86, mountLength: 2.6, mountHeight: 1.4, riderHeight: 1.8, riderColor: C.metal });
    g.add(mesh(new THREE.ConeGeometry(0.16, 0.7, 8), toon(0xe8e4d0), { y: 1.4, z: 1.5, rx: Math.PI / 2.4, name: 'Horn' }));
    g.add(mesh(new THREE.BoxGeometry(0.12, 1.6, 0.25), toon(0xff7a2a, { emissive: 0xff4400 }), { x: 0.9, y: 2.8, name: 'FireSword' }));
    return g;
  },
  troll_wolfpack() {
    const g = troll({ height: 2.2, color: C.brute, bulk: 1.3 });
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.12, 1.6, 8), toon(C.woodDark), { x: 0.6, y: 0.4, z: -1.2, rx: Math.PI / 2.6, name: 'Club' }));
    for (const [x, z] of [[-1.1, 0.9], [1.2, 1.0], [0.1, 1.6]]) {
      const w = mounted({ mountColor: 0x6a6a70, mountLength: 1.1, mountHeight: 0.5, riderHeight: 0 });
      w.position.set(x, 0, z);
      g.add(w);
    }
    return g;
  },
  troll_giant() {
    const g = troll({ height: 5.0, color: 0x4f7f3a, bulk: 1.3, crown: true });
    g.add(mesh(new THREE.BoxGeometry(1.4, 2.2, 0.15), toon(C.metal), { x: -1.4, y: 2.2, name: 'Shield' }));
    g.add(mesh(new THREE.BoxGeometry(0.25, 3.6, 0.5), toon(0x9fd8ff, { emissive: 0x2a7fff }), { x: 1.4, y: 3.2, name: 'GlowSword' }));
    return g;
  },

  decor_tree() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.8, 8), toon(C.trunk), { y: 0.4 }));
    g.add(mesh(new THREE.SphereGeometry(0.62, 10, 8), toon(C.leaf), { y: 1.15 }));
    g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), toon(0x4fb04f), { y: 1.6, x: 0.15 }));
    return g;
  },

  decor_rock() {
    const g = new THREE.Group();
    const r = mesh(new THREE.DodecahedronGeometry(0.5, 0), toon(C.rock), { y: 0.3 });
    r.scale.set(1.2, 0.7, 1);
    g.add(r);
    g.add(mesh(new THREE.DodecahedronGeometry(0.25, 0), toon(0x808080), { x: 0.55, y: 0.15, z: 0.3 }));
    return g;
  },

  decor_cactus() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.4, 10), toon(C.cactus), { y: 0.7 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.55, 8), toon(C.cactus), { x: 0.36, y: 0.95, rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 8), toon(C.cactus), { x: 0.55, y: 1.2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 8), toon(C.cactus), { x: -0.3, y: 0.75, rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 8), toon(C.cactus), { x: -0.5, y: 0.95 }));
    return g;
  },

  decor_reed() {
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(0.04, 0.05, 1.2, 6);
    for (const [x, z, h] of [[0, 0, 1.2], [0.25, 0.1, 1.0], [-0.2, 0.2, 0.9], [0.1, -0.25, 1.1]]) {
      const r = mesh(geo, toon(C.reed), { x, y: h / 2, z });
      r.scale.y = h / 1.2;
      g.add(r);
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 6), toon(C.woodDark), { x, y: h + 0.05, z }));
    }
    return g;
  },

  /** A 60 x 12 m mountain ridge (30 x 6 tiles) with snowy peaks; origin bottom centre. */
  decor_mountain() {
    const g = new THREE.Group();
    const rock = toon(0x7d7f86);
    const snow = toon(0xf4f7fb);
    const peaks = [[-24, 9, 7], [-14, 13, 8], [-4, 16, 9], [6, 12, 8], [15, 15, 8], [24, 8, 6]];
    for (const [x, h, r] of peaks) {
      g.add(mesh(new THREE.ConeGeometry(r, h, 7), rock, { x, y: h / 2, z: (x % 3) * 0.6 }));
      g.add(mesh(new THREE.ConeGeometry(r * 0.35, h * 0.32, 7), snow, { x, y: h - h * 0.16, z: (x % 3) * 0.6 }));
    }
    g.add(mesh(new THREE.BoxGeometry(60, 1.2, 12), toon(0x5f8f43), { y: 0.6 }));
    return g;
  },

  /** 3x3-tile castle (roughly 6 m across), origin bottom centre, gate on +Z. */
  base_castle() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(5.0, 1.6, 5.0), toon(C.stone), { y: 0.8 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.6, 12), toon(C.stoneDark), { x: sx * 2.2, y: 1.3, z: sz * 2.2 }));
        g.add(mesh(new THREE.ConeGeometry(0.62, 0.8, 12), toon(C.red), { x: sx * 2.2, y: 2.9, z: sz * 2.2 }));
      }
    }
    g.add(mesh(new THREE.BoxGeometry(2.0, 3.0, 2.0), toon(C.stone), { y: 1.5 }));
    g.add(mesh(new THREE.BoxGeometry(1.2, 1.4, 0.3), toon(C.woodDark), { y: 0.7, z: 2.5 }));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), toon(C.metal), { y: 3.8 }));
    const flag = new THREE.PlaneGeometry(0.9, 0.5, 16, 8);
    flag.translate(0.45, 0, 0); // pole edge at x = 0, cloth along +X
    g.add(mesh(flag, toon(C.gold, { side: THREE.DoubleSide }), { y: 4.3, name: 'Flag' }));
    return g;
  },

  spawn_gate() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(1.1, 3.0, 1.1), toon(C.stone), { x: sx * 1.9, y: 1.5 }));
      g.add(mesh(new THREE.ConeGeometry(0.8, 0.7, 4), toon(C.woodDark), { x: sx * 1.9, y: 3.35 }));
    }
    g.add(mesh(new THREE.BoxGeometry(2.8, 0.7, 0.8), toon(C.stone), { y: 2.1 }));
    g.add(mesh(new THREE.BoxGeometry(1.7, 1.7, 0.1), toon(0x111014), { y: 0.85, z: 0.42 }));
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), toon(C.metal), { x: i * 0.3, y: 1.55, z: 0.5 }));
    g.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), toon(0xdddddd), { y: 2.85 }));
    return g;
  },
};

function fallbackCube() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1, 1, 1), toon(0xff00ff), { y: 0.5 }));
  return g;
}

/** Builds a procedural stand-in for a model that has no .glb yet. */
export function buildPlaceholder(name) {
  const builder = BUILDERS[name];
  const group = builder ? builder() : fallbackCube();
  group.name = name;
  return group;
}
