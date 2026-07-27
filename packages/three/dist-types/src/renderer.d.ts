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
        objectType: 'building' | 'landmark' | 'poi';
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
    /** Rebuild POI pins + picking after world edits. */
    refreshPois(): void;
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
    /** Fly the camera to a world XZ position (terrain height is sampled). */
    focusPoint(point: {
        x: number;
        z: number;
    }, radius?: number): Promise<void>;
    /**
     * Continuously chase a moving point (e.g. a game unit). The provider is polled
     * every frame; returning null, or passing null, stops following and restores
     * orbit control. Used by `createGameView().followUnit`.
     */
    setFollowTarget(get: (() => {
        x: number;
        y: number;
        z: number;
    } | null) | null): void;
    setSelected(objectId: string | null): void;
    getSelected(): string | null;
    setHovered(objectId: string | null): void;
    goHome(): void;
    on<K extends keyof MapEngineEvents>(event: K, handler: (payload: MapEngineEvents[K]) => void): () => void;
    /**
     * Register a per-frame callback; returns an unsubscribe function. Callbacks
     * fire in registration order (insertion-ordered internally) — consumers
     * rely on this, e.g. `createGameView` composes with an AI controller
     * registered first via this same order so the AI decides before the view
     * ticks the simulation within the same frame.
     */
    onFrame(cb: (dt: number) => void): () => void;
    dispose(): void;
}
export declare function createThreeMapRenderer(options: ThreeMapRendererOptions): ThreeMapRenderer;
