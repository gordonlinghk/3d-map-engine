import type { MapLayerId, MapWorld } from '@map-engine/core';
/**
 * Structural interface of the renderer used by the UI. `ThreeMapRenderer`
 * satisfies it — the UI package deliberately avoids importing Three.js.
 */
export type CameraMode = 'orbit' | 'fly' | 'walk';
export type EnvironmentMode = 'day' | 'golden-hour' | 'night';
export interface MapRendererLike {
    readonly camera: {
        position: {
            x: number;
            y: number;
            z: number;
        };
        quaternion: {
            x: number;
            y: number;
            z: number;
            w: number;
        };
    };
    readonly domElement: HTMLCanvasElement;
    setCameraMode(mode: CameraMode): void;
    getCameraMode(): CameraMode;
    setEnvironment(mode: EnvironmentMode): void;
    setLayerVisibility(layer: MapLayerId, visible: boolean): void;
    focusObject(objectId: string): Promise<void>;
    projectToScreen(pos: {
        x: number;
        y: number;
        z: number;
    }): {
        x: number;
        y: number;
        visible: boolean;
    };
    getObjectAnchor(objectId: string): {
        x: number;
        y: number;
        z: number;
    } | null;
    setSelected(objectId: string | null): void;
    getSelected(): string | null;
    goHome(): void;
    on(event: string, handler: (payload: any) => void): () => void;
    onFrame(cb: (dt: number) => void): () => void;
}
export type EngineContextValue = {
    renderer: MapRendererLike;
    world: MapWorld;
};
