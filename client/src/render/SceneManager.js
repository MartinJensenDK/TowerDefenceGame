import * as THREE from 'three';

export const TILE_TOP = 0.12;

/** Owns the renderer, scene, camera, lights and the animation loop. */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.timer = new THREE.Timer();
    this.onFrame = null;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 0.9);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(20, 35, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setTheme({ sky, fog }, extent = 16) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(fog), Math.max(45, 2.5 * extent), Math.max(110, 6 * extent));
    this.camera.far = Math.max(300, 8 * extent);
    // A 0.1 near plane against an 800 far plane starves the depth buffer and makes the 2 cm
    // overlays (frozen tiles, path chevrons) z-fight; the orbit rig never gets closer than 10.
    this.camera.near = extent > 40 ? 1 : 0.1;
    this.camera.updateProjectionMatrix();
  }

  focusSun(cx, cz, extent = 16) {
    const half = Math.max(30, 1.15 * extent);
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: Math.max(120, 6 * extent) });
    const size = extent > 40 ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.position.set(cx + 0.6 * extent, 1.2 * extent + 20, cz + 0.45 * extent);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
