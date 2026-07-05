import type { BuildingInfo, MapWorld } from './types';
/**
 * User edits are stored as a compact overlay (rather than a full world
 * snapshot) so they survive regeneration of the same world and stay small
 * enough for localStorage.
 */
export type EditOverlay = {
    version: 1;
    /** Buildings whose data was changed — full snapshots keyed by id. */
    modified: BuildingInfo[];
    /** Buildings created by the user (source: 'user-defined'). */
    added: BuildingInfo[];
    /** Ids of deleted buildings. */
    deleted: string[];
};
export declare function emptyOverlay(): EditOverlay;
export declare function overlayIsEmpty(o: EditOverlay): boolean;
/** Insert a building into the world (objects + chunk registration). */
export declare function addBuildingToWorld(world: MapWorld, building: BuildingInfo): void;
/** Remove a building from the world (objects + chunk registration). */
export declare function removeBuildingFromWorld(world: MapWorld, id: string): void;
/** Replace a building's data in place (position may have changed chunks). */
export declare function replaceBuildingInWorld(world: MapWorld, building: BuildingInfo): void;
/** Apply a saved overlay onto a freshly generated world. */
export declare function applyEditOverlay(world: MapWorld, overlay: EditOverlay): void;
/** Rotate a footprint around its centroid by `radians` (returns new points). */
export declare function rotateFootprint(building: BuildingInfo, radians: number): BuildingInfo['footprint'];
/** Translate a footprint (and return it) so the building centers on (x, z). */
export declare function moveFootprint(building: BuildingInfo, x: number, z: number): BuildingInfo['footprint'];
