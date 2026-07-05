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
    /**
     * 'high' (default): shadows + full pixel ratio.
     * 'low': no shadow mapping, pixel ratio 1 — for weak GPUs and headless
     * automation, where the shadow pass makes the main thread unresponsive.
     */
    quality?: 'high' | 'low';
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
    /** Raycast the terrain — returns the ground point under the pointer. */
    pickGround(pointer: {
        x: number;
        y: number;
    }): {
        x: number;
        y: number;
        z: number;
    } | null;
    /** Rebuild building meshes + picking + collision after world edits. */
    refreshBuildings(): void;
    /** Pause camera controls and click-selection during editor drags. */
    setEditorDragging(v: boolean): void;
    /** Project a world position to canvas pixel coordinates. */
    projectToScreen(pos: {
        x: number;
        y: number;
        z: number;
    }): {
        x: number;
        y: number;
        visible: boolean;
    };
    /** Anchor point above an object, for floating labels. Null if unknown id. */
    getObjectAnchor(objectId: string): {
        x: number;
        y: number;
        z: number;
    } | null;
    getEnvironment(): EnvironmentMode;
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
