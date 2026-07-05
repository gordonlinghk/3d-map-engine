import * as THREE from 'three';
import type { MapLayerId, MapWorld } from '@map-engine/core';
import { type MapObjectHit } from './interaction';
export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';
export type MapEngineEvents = {
    'object:hover': {
        objectId: string | null;
    };
    'object:selected': {
        objectId: string;
        objectType: 'building' | 'landmark';
    };
    'object:cleared': Record<string, never>;
    'camera:changed': {
        position: {
            x: number;
            y: number;
            z: number;
        };
        mode: CameraMode;
    };
    'world:loaded': {
        worldId: string;
    };
};
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
    pickObject(pointer: {
        x: number;
        y: number;
    }): MapObjectHit | null;
    focusObject(objectId: string): Promise<void>;
    setSelected(objectId: string | null): void;
    getSelected(): string | null;
    setHovered(objectId: string | null): void;
    goHome(): void;
    on<K extends keyof MapEngineEvents>(event: K, handler: (payload: MapEngineEvents[K]) => void): () => void;
    onFrame(cb: (dt: number) => void): () => void;
    dispose(): void;
}
export declare function createThreeMapRenderer(options: ThreeMapRendererOptions): ThreeMapRenderer;
