import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { HeightSampler } from '@map-engine/core';
import type { ColliderIndex } from './collision';
import type { CameraMode } from './renderer';

const WALK_EYE_HEIGHT = 2.3;
const EPS = 1e-4;

export type CameraRig = {
  readonly orbit: OrbitControls;
  getMode(): CameraMode;
  setMode(mode: CameraMode): void;
  setTerrain(sampler: HeightSampler | null, waterLevel: number): void;
  setColliders(index: ColliderIndex | null): void;
  goHome(homePos: THREE.Vector3, homeTarget: THREE.Vector3): void;
  /** Smoothly fly the camera to look at a point. Resolves when done. */
  focusOn(point: THREE.Vector3, radius: number): Promise<void>;
  /**
   * Continuously chase a moving point. The provider is polled every frame; the
   * viewing angle/distance in effect when following starts is preserved, and
   * the camera smoothly tracks the point. Returning null (or passing null)
   * stops following and restores orbit control.
   */
  setFollowTarget(get: (() => THREE.Vector3 | null) | null): void;
  update(dt: number): void;
  /** Fires (throttled) whenever the camera pose changes. */
  onChange(cb: (mode: CameraMode) => void): void;
  dispose(): void;
};

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement,
): CameraRig {
  const orbit = new OrbitControls(camera, domElement);
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI / 2 - 0.02;
  orbit.minDistance = 10;
  orbit.maxDistance = 4000;

  let mode: CameraMode = 'orbit';
  let sampler: HeightSampler | null = null;
  let waterLevel = 0;
  let colliders: ColliderIndex | null = null;
  const PLAYER_RADIUS = 0.8;
  let bobPhase = 0;

  // Free-look state (fly + walk).
  let yaw = 0;
  let pitch = -0.4;
  let flySpeed = 90;
  let dragging = false;

  const keys = new Set<string>();

  let tween: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
    duration: number;
    resolve: () => void;
  } | null = null;

  // Camera-follow: track a moving point while preserving the initial framing.
  let followGet: (() => THREE.Vector3 | null) | null = null;
  let followOffset: THREE.Vector3 | null = null;

  let changeCb: ((mode: CameraMode) => void) | null = null;
  let lastEmitAt = 0;
  const lastPose = new THREE.Vector3();
  const lastQuat = new THREE.Quaternion();

  const groundAt = (x: number, z: number): number =>
    Math.max(sampler ? sampler(x, z) : 0, waterLevel);

  const syncAnglesFromCamera = (): void => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = euler.y;
    pitch = euler.x;
  };

  const applyAngles = (): void => {
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  };

  const isTypingTarget = (e: Event): boolean => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e)) return;
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    keys.delete(e.code);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const onPointerDown = (e: PointerEvent): void => {
    if (mode === 'fly' && e.button === 0) {
      dragging = true;
      domElement.setPointerCapture(e.pointerId);
    }
    if (mode === 'walk' && document.pointerLockElement !== domElement) {
      domElement.requestPointerLock?.();
    }
  };
  const onPointerUp = (): void => {
    dragging = false;
  };
  const onPointerMove = (e: PointerEvent): void => {
    const locked = document.pointerLockElement === domElement;
    if (mode === 'walk' && locked) {
      yaw -= e.movementX * 0.0022;
      pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.35, 1.35);
      applyAngles();
    } else if (mode === 'fly' && dragging) {
      yaw -= e.movementX * 0.0028;
      pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0028, -1.45, 1.45);
      applyAngles();
    }
  };
  const onWheel = (e: WheelEvent): void => {
    if (mode === 'fly') {
      flySpeed = THREE.MathUtils.clamp(flySpeed * Math.pow(1.0015, -e.deltaY), 15, 500);
    }
  };
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('wheel', onWheel, { passive: true });

  const moveFreeLook = (dt: number): void => {
    const speed = flySpeed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3 : 1);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (mode === 'walk') {
      forward.y = 0;
      forward.normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const move = new THREE.Vector3();
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (mode === 'fly') {
      if (keys.has('KeyE')) move.y += 1;
      if (keys.has('KeyQ')) move.y -= 1;
    }
    let moved = false;
    if (move.lengthSq() > 0) {
      move.normalize();
      const walkFactor = mode === 'walk' ? 0.25 : 1;

      if (mode === 'walk') {
        const fromX = camera.position.x;
        const fromZ = camera.position.z;
        let toX = fromX + move.x * speed * walkFactor * dt;
        let toZ = fromZ + move.z * speed * walkFactor * dt;
        // Buildings and solid landmarks block movement (with wall sliding).
        if (colliders) {
          const r = colliders.resolveMovement(fromX, fromZ, toX, toZ, PLAYER_RADIUS);
          toX = r.x;
          toZ = r.z;
        }
        // The sea blocks walking; the beach is fine.
        if (sampler && sampler(toX, toZ) < waterLevel - 0.45) {
          if (sampler(toX, fromZ) >= waterLevel - 0.45) toZ = fromZ;
          else if (sampler(fromX, toZ) >= waterLevel - 0.45) toX = fromX;
          else {
            toX = fromX;
            toZ = fromZ;
          }
        }
        moved = Math.hypot(toX - fromX, toZ - fromZ) > 1e-4;
        if (moved) bobPhase += Math.hypot(toX - fromX, toZ - fromZ) * 0.55;
        camera.position.x = toX;
        camera.position.z = toZ;
      } else {
        camera.position.addScaledVector(move, speed * walkFactor * dt);
      }
    }

    if (mode === 'walk') {
      const bob = moved ? Math.sin(bobPhase) * 0.055 : 0;
      camera.position.y =
        groundAt(camera.position.x, camera.position.z) + WALK_EYE_HEIGHT + bob;
    } else if (mode === 'fly') {
      // Never fly below the ground.
      const minY = groundAt(camera.position.x, camera.position.z) + 2;
      if (camera.position.y < minY) camera.position.y = minY;
    }
  };

  const stopFollow = (): void => {
    followGet = null;
    followOffset = null;
    orbit.enabled = mode === 'orbit';
    if (mode === 'orbit') orbit.update();
    else syncAnglesFromCamera();
  };

  // Returns false when the target vanished (follow was auto-stopped).
  const followStep = (dt: number): boolean => {
    const p = followGet?.() ?? null;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      stopFollow();
      return false;
    }
    if (!followOffset) {
      followOffset = camera.position.clone().sub(p);
      // Degenerate framing (camera already on the point) → sensible default.
      if (followOffset.lengthSq() < 1) followOffset.set(0, 60, 90);
    }
    const k = 1 - Math.exp(-dt / 0.18);
    camera.position.lerp(p.clone().add(followOffset), k);
    orbit.target.lerp(p, k);
    camera.lookAt(orbit.target);
    return true;
  };

  const maybeEmitChange = (): void => {
    if (!changeCb) return;
    const now = performance.now();
    if (now - lastEmitAt < 120) return;
    if (
      camera.position.distanceToSquared(lastPose) > EPS ||
      Math.abs(1 - Math.abs(camera.quaternion.dot(lastQuat))) > 1e-6
    ) {
      lastPose.copy(camera.position);
      lastQuat.copy(camera.quaternion);
      lastEmitAt = now;
      changeCb(mode);
    }
  };

  return {
    orbit,

    getMode: () => mode,

    setMode(next: CameraMode): void {
      // Switching camera mode takes control back from any follow target.
      // Route through stopFollow so orbit input is re-enabled even when the
      // requested mode equals the current one (early return below).
      if (followGet) stopFollow();
      if (next === mode) return;
      if (document.pointerLockElement === domElement && next !== 'walk') {
        document.exitPointerLock?.();
      }
      mode = next;
      orbit.enabled = next === 'orbit';
      if (next === 'orbit') {
        // Look at a point ahead of the camera.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const target = camera.position.clone().addScaledVector(forward, 120);
        target.y = Math.max(target.y, 0);
        orbit.target.copy(target);
        orbit.update();
      } else {
        syncAnglesFromCamera();
        if (next === 'walk') {
          camera.position.y = groundAt(camera.position.x, camera.position.z) + WALK_EYE_HEIGHT;
          pitch = THREE.MathUtils.clamp(pitch, -0.6, 0.6);
          applyAngles();
        }
      }
    },

    setTerrain(next, wl) {
      sampler = next;
      waterLevel = wl;
    },

    setColliders(index) {
      colliders = index;
    },

    goHome(homePos, homeTarget) {
      tween = null;
      if (followGet) stopFollow();
      camera.position.copy(homePos);
      orbit.target.copy(homeTarget);
      if (mode === 'orbit') orbit.update();
      else {
        camera.lookAt(homeTarget);
        syncAnglesFromCamera();
      }
    },

    focusOn(point, radius) {
      if (followGet) stopFollow();
      const distance = THREE.MathUtils.clamp(radius * 5, 45, 320);
      const dir = camera.position.clone().sub(point);
      dir.y = 0;
      if (dir.lengthSq() < 1) dir.set(0.7, 0, 0.7);
      dir.normalize();
      const toPos = point
        .clone()
        .addScaledVector(dir, distance)
        .add(new THREE.Vector3(0, distance * 0.55, 0));
      return new Promise<void>((resolve) => {
        tween = {
          fromPos: camera.position.clone(),
          toPos,
          fromTarget: orbit.target.clone(),
          toTarget: point.clone(),
          t: 0,
          duration: 1.1,
          resolve,
        };
      });
    },

    update(dt) {
      if (tween) {
        tween.t += dt / tween.duration;
        const k = easeInOutCubic(Math.min(tween.t, 1));
        camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
        orbit.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
        camera.lookAt(orbit.target);
        if (tween.t >= 1) {
          // Focus always lands in orbit-style inspection around the target.
          if (mode !== 'orbit') {
            mode = 'orbit';
            orbit.enabled = true;
          }
          tween.resolve();
          tween = null;
        }
      } else if (followGet) {
        followStep(dt);
      } else if (mode === 'orbit') {
        orbit.update();
      } else {
        moveFreeLook(dt);
      }
      maybeEmitChange();
    },

    setFollowTarget(get) {
      followGet = get;
      followOffset = null;
      if (get) {
        orbit.enabled = false;
      } else {
        stopFollow();
      }
    },

    onChange(cb) {
      changeCb = cb;
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('wheel', onWheel);
      orbit.dispose();
    },
  };
}
