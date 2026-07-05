import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
/**
 * Lamp posts along avenues and highways. At night the lamp heads glow
 * (emissive instanced spheres) — no real point lights, so it stays cheap.
 */
export type StreetLightsResult = {
    group: THREE.Group;
    setNightMode: (night: boolean) => void;
};
export declare function buildStreetLights(world: MapWorld): StreetLightsResult;
