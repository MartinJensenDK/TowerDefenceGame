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

  base_castle() {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), toon(C.stone), { y: 0.5 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.5, 10), toon(C.stoneDark), { x: sx * 0.7, y: 0.75, z: sz * 0.7 }));
        g.add(mesh(new THREE.ConeGeometry(0.3, 0.4, 10), toon(C.red), { x: sx * 0.7, y: 1.7, z: sz * 0.7 }));
      }
    }
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), toon(C.metal), { y: 1.6 }));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.03), toon(C.gold), { x: 0.3, y: 2.0, name: 'Flag' }));
    return g;
  },

  spawn_gate() {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.7, 8), toon(C.woodDark), { x: sx * 0.75, y: 0.85 }));
    g.add(mesh(new THREE.BoxGeometry(1.9, 0.28, 0.3), toon(C.wood), { y: 1.75 }));
    g.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), toon(0xdddddd), { y: 2.05 }));
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
