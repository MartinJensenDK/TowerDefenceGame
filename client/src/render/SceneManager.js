import * as THREE from 'three';

export const TILE_TOP = 0.12;

/** Owns the renderer, scene, camera, lights and the animation loop. */
export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    this.clock = new THREE.Clock(false);
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

  setTheme({ sky, fog }) {
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(new THREE.Color(fog), 45, 110);
  }

  focusSun(cx, cz) {
    this.sun.position.set(cx + 20, 35, cz + 15);
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
    this.clock.start();
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.renderer.setAnimationLoop(null);
    this.clock.stop();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
