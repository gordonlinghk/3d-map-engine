import * as THREE from 'three';
import type { MapLayerId, MapWorld } from '@map-engine/core';
export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';
export type ThreeMapRendererOptions = {
    container: HTMLElement;
};
export interface ThreeMapRenderer {
    readonly scene: THREE.Scene;
    readonly camera: THREE.PerspectiveCamera;
    readonly domElement: HTMLCanvasElement;
    loadWorld(world: MapWorld): Promise<void>;
    setCameraMode(mode: CameraMode): void;
    getCameraMode(): CameraMode;
    setEnvironment(mode: EnvironmentMode): void;
    setLayerVisibility(layer: MapLayerId, visible: boolean): void;
    goHome(): void;
    onFrame(cb: (dt: number) => void): () => void;
    dispose(): void;
}
export declare function createThreeMapRenderer(options: ThreeMapRendererOptions): ThreeMapRenderer;
