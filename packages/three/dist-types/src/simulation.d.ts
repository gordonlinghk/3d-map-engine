import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
export type SimulationLayer = {
    group: THREE.Group;
    update(dt: number): void;
    dispose(): void;
};
export declare function createSimulationLayer(world: MapWorld): SimulationLayer;
