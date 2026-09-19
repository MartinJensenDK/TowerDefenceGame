import * as THREE from 'three';

const FONT = 'bold 64px "Comic Sans MS", "Chalkboard SE", "Trebuchet MS", sans-serif';

/** Projectiles, comic hit sprites and death bursts. Purely cosmetic; damage is applied by Game. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.textures = new Map();
    this.arrowGeo = new THREE.ConeGeometry(0.09, 0.7, 6);
    this.arrowMat = new THREE.MeshToonMaterial({ color: 0x5a3a1a });
    this.shellGeo = new THREE.SphereGeometry(0.24, 10, 8);
    this.shellMat = new THREE.MeshToonMaterial({ color: 0x333333 });
    this.tmp = new THREE.Vector3();
  }

  #texture(text, color) {
    const key = `${text}|${color}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#2b1d0e';
    ctx.strokeText(text, 128, 64);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, tex);
    return tex;
  }

  #targetPoint(target, out) {
    const y = target.flying ? 1.6 : 0.6;
    return out.set(target.x, y, target.z);
  }

  spawnProjectile({ from, target, kind }) {
    const mesh = kind === 'shell' ? new THREE.Mesh(this.shellGeo, this.shellMat) : new THREE.Mesh(this.arrowGeo, this.arrowMat);
    mesh.castShadow = true;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.items.push({ type: 'projectile', mesh, kind, target, start: from.clone(), t: 0, duration: kind === 'shell' ? 0.55 : 0.16 });
  }

  hitSprite(position, text = 'POW!', color = '#ffd23f') {
    const mat = new THREE.SpriteMaterial({ map: this.#texture(text, color), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 0.4;
    sprite.renderOrder = 20;
    sprite.scale.set(1.6, 0.8, 1);
    this.scene.add(sprite);
    this.items.push({ type: 'pop', sprite, t: 0, duration: 0.45 });
  }

  deathBurst(position) {
    const tex = this.#texture('★', '#ffd23f');
    for (let i = 0; i < 6; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      sprite.position.copy(position);
      sprite.scale.set(0.5, 0.25, 1);
      sprite.renderOrder = 20;
      const a = (i / 6) * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a) * 3, 4 + Math.random() * 2, Math.sin(a) * 3);
      this.scene.add(sprite);
      this.items.push({ type: 'star', sprite, vel, t: 0, duration: 0.7 });
    }
  }

  update(dt) {
    const keep = [];
    for (const item of this.items) {
      item.t += dt;
      const k = Math.min(1, item.t / item.duration);
      if (item.type === 'projectile') {
        const to = this.#targetPoint(item.target, this.tmp);
        item.mesh.position.lerpVectors(item.start, to, k);
        if (item.kind === 'shell') {
          item.mesh.position.y += Math.sin(k * Math.PI) * 2.5;
        } else {
          item.mesh.lookAt(to);
          item.mesh.rotateX(Math.PI / 2);
        }
        if (k >= 1) {
          this.scene.remove(item.mesh);
          this.hitSprite(to, item.kind === 'shell' ? 'BOOM!' : 'POW!', item.kind === 'shell' ? '#ff6b3d' : '#ffd23f');
          continue;
        }
      } else if (item.type === 'pop') {
        item.sprite.scale.set(1.6 * (0.5 + k), 0.8 * (0.5 + k), 1);
        item.sprite.position.y += dt * 0.8;
        item.sprite.material.opacity = 1 - k * k;
        if (k >= 1) {
          this.scene.remove(item.sprite);
          item.sprite.material.dispose();
          continue;
        }
      } else if (item.type === 'star') {
        item.vel.y -= 12 * dt;
        item.sprite.position.addScaledVector(item.vel, dt);
        item.sprite.material.opacity = 1 - k;
        if (k >= 1) {
          this.scene.remove(item.sprite);
          item.sprite.material.dispose();
          continue;
        }
      }
      keep.push(item);
    }
    this.items = keep;
  }

  dispose() {
    for (const item of this.items) {
      this.scene.remove(item.mesh ?? item.sprite);
      if (item.sprite) item.sprite.material.dispose();
    }
    this.items = [];
    for (const tex of this.textures.values()) tex.dispose();
    this.arrowGeo.dispose();
    this.arrowMat.dispose();
    this.shellGeo.dispose();
    this.shellMat.dispose();
  }
}
