import type { MapWorld } from '@map-engine/core';
/**
 * Walk-mode collision: 2D axis-aligned boxes (building footprints + solid
 * landmark bases) in a uniform spatial hash. Movement resolves per axis,
 * which gives natural wall sliding.
 */
export type Collider = {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
};
export type ColliderIndex = {
    /** Resolve a move from (fromX, fromZ) to (toX, toZ) for a circle of `radius`. */
    resolveMovement(fromX: number, fromZ: number, toX: number, toZ: number, radius: number): {
        x: number;
        z: number;
    };
    readonly size: number;
};
export declare function createColliderIndex(world: MapWorld): ColliderIndex;
