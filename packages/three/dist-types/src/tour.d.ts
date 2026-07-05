import type { MapWorld } from '@map-engine/core';
import type { ThreeMapRenderer } from './renderer';
export type Tour = {
    start(): void;
    stop(): void;
    isActive(): boolean;
};
/** Auto-fly between landmarks and the most prominent company towers. */
export declare function createTour(renderer: ThreeMapRenderer, world: MapWorld): Tour;
