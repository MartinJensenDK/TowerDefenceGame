import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Orbit camera over the map: rotate 360°, zoom 10–45 towards the cursor, tilt 25°–70° above the ground. */
export class CameraRig {
  constructor(camera, domElement, { centerX, centerZ, extent }) {
    this.controls = new OrbitControls(camera, domElement);
    const c = this.controls;
    c.target.set(centerX, 0, centerZ);
    c.enablePan = false;
    c.minDistance = 10;
    c.maxDistance = 45;
    // OrbitControls measures the polar angle from straight up, so 25°–70° elevation is 20°–65° polar.
    c.minPolarAngle = THREE.MathUtils.degToRad(20);
    c.maxPolarAngle = THREE.MathUtils.degToRad(65);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.6;
    c.zoomSpeed = 2.5; // ~12 % per wheel notch: the full 10–45 range takes about a dozen notches
    // Zoom towards the point under the cursor; the orbit target slides along the ground plane
    // and stays within the map so the camera cannot wander off into the void.
    c.zoomToCursor = true;
    c.screenSpacePanning = false;
    c.cursor.set(centerX, 0, centerZ);
    c.maxTargetRadius = extent;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    camera.position.set(centerX, extent * 1.3, centerZ + extent * 1.25);
    c.update();
  }

  update() {
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
