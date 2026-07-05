import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
import type { BuildingsBuildResult } from './buildingsMesh';
export type PickableInfo = {
    id: string;
    type: 'building' | 'landmark';
    position: THREE.Vector3;
    /** Horizontal radius used for rings and focus distance. */
    radius: number;
    height: number;
    /** Box size for building outline highlight. */
    size?: THREE.Vector3;
};
export type MapObjectHit = {
    objectId: string;
    objectType: 'building' | 'landmark';
    point: {
        x: number;
        y: number;
        z: number;
    };
    distance: number;
};
export declare function buildPickableIndex(world: MapWorld, landmarksGroup: THREE.Group): Map<string, PickableInfo>;
/** Hover + selection indicators (rings and building outline). */
export declare function createHighlights(scene: THREE.Scene): {
    setHover(info: PickableInfo | null): void;
    setSelected(info: PickableInfo | null): void;
    tick(time: number): void;
    dispose(): void;
};
export type Highlights = ReturnType<typeof createHighlights>;
/** Raycast helper resolving instanced buildings and landmark groups to ids. */
export declare function createPicker(camera: THREE.Camera, domElement: HTMLElement, getTargets: () => {
    buildings: BuildingsBuildResult | null;
    landmarks: THREE.Group | null;
    terrain: THREE.Object3D | null;
}): {
    pick: (clientX: number, clientY: number) => MapObjectHit | null;
    pickGround: (clientX: number, clientY: number) => THREE.Vector3 | null;
};
