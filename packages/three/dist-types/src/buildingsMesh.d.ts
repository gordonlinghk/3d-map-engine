import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
export declare function makeFacadeTexture(floors: number, cols: number, options: {
    night: boolean;
}): THREE.CanvasTexture;
export type BuildingsBuildResult = {
    group: THREE.Group;
    /** instanced mesh -> building ids by instanceId (for picking). */
    instanceIndex: Map<THREE.InstancedMesh, string[]>;
    setNightMode: (night: boolean) => void;
};
export declare function buildBuildingsGroup(world: MapWorld): BuildingsBuildResult;
