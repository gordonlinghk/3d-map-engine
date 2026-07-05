import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { HeightSampler } from '@map-engine/core';
import type { ColliderIndex } from './collision';
import type { CameraMode } from './renderer';
export type CameraRig = {
    readonly orbit: OrbitControls;
    getMode(): CameraMode;
    setMode(mode: CameraMode): void;
    setTerrain(sampler: HeightSampler | null, waterLevel: number): void;
    setColliders(index: ColliderIndex | null): void;
    goHome(homePos: THREE.Vector3, homeTarget: THREE.Vector3): void;
    /** Smoothly fly the camera to look at a point. Resolves when done. */
    focusOn(point: THREE.Vector3, radius: number): Promise<void>;
    update(dt: number): void;
    /** Fires (throttled) whenever the camera pose changes. */
    onChange(cb: (mode: CameraMode) => void): void;
    dispose(): void;
};
export declare function createCameraRig(camera: THREE.PerspectiveCamera, domElement: HTMLElement): CameraRig;
