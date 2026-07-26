import * as THREE from 'three';
import type { MapWorld } from '@map-engine/core';
export declare function makeFacadeTexture(floors: number, cols: number, options: {
    night: boolean;
}): THREE.CanvasTexture;
export type BuildingsBuildResult = {
    group: THREE.Group;
    /** instanced mesh -> building ids by instanceId (for picking). */
    instanceIndex: Map<THREE.InstancedMesh, string[]>;
    /** Merged extruded mesh for polygon footprints (OSM); picking via faceRanges. */
    polyMesh: THREE.Mesh | null;
    /** Merged hip-roof mesh for chinese buildings; picking via faceRanges. */
    roofMesh: THREE.Mesh | null;
    setNightMode: (night: boolean) => void;
};
export type FaceRange = {
    start: number;
    end: number;
    id: string;
};
/**
 * A hipped roof (廡殿/攢尖-ish) sized to a w×d base, base plane at y=0 centred
 * on the origin, rising to a ridge. Eaves overhang the walls; the ridge runs
 * along the longer base axis (a pyramid when square). DoubleSide material is
 * used downstream so triangle winding is irrelevant.
 *
 * The four slopes are curved surfaces, not planes: each is tessellated on a
 * (t, u) grid — t sweeps ridge (0) → eave (1), u runs along the patch — and two
 * shape functions give the 飛簷 silhouette.
 *
 *  - 凹曲 (concave sweep): y = rH·(1−t)^1.6, the 舉折 profile. At mid-slope that
 *    is ≈0.33·rH, visibly below the 0.5·rH straight ridge→eave chord.
 *  - 翹角 (upturned corners): eave corners lift by `cornerLift`, faded by the
 *    product of the two per-eave-edge corner factors (so edge midpoints stay
 *    flat at y=0) and by a ridge fade that is zero for t ≤ 0.6.
 *
 * Only Y is displaced, so the eave rectangle stays exactly
 * (w/2+overhang) × (d/2+overhang) and the peak stays exactly rH — the corner
 * lift is at most 0.3·rH, so the ridge remains the highest point.
 */
export declare function makeHipRoof(w: number, d: number): THREE.BufferGeometry;
export declare function buildBuildingsGroup(world: MapWorld): BuildingsBuildResult;
