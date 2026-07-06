import type { BuildingInfo, MapWorld, PoiInfo } from './types';
/**
 * User edits are stored as a compact overlay (rather than a full world
 * snapshot) so they survive regeneration of the same world and stay small
 * enough for localStorage.
 *
 * v2 adds POI (map annotation) tracking alongside buildings.
 */
export type EditOverlay = {
    version: 2;
    /** Buildings whose data was changed — full snapshots keyed by id. */
    modified: BuildingInfo[];
    /** Buildings created by the user (source: 'user-defined'). */
    added: BuildingInfo[];
    /** Ids of deleted buildings. */
    deleted: string[];
    /** POIs created by the user. */
    addedPois: PoiInfo[];
    /** POIs whose data was changed — full snapshots keyed by id. */
    modifiedPois: PoiInfo[];
    /** Ids of deleted POIs. */
    deletedPois: string[];
};
export declare function emptyOverlay(): EditOverlay;
export declare function overlayIsEmpty(o: EditOverlay): boolean;
/**
 * Coerce arbitrary parsed JSON into a valid v2 overlay. Accepts a v1 overlay
 * (`{version:1, modified, added, deleted}`), filling in empty POI fields, and a
 * v2 overlay. Any malformed input degrades to an empty overlay rather than
 * throwing — callers may feed unvalidated localStorage or draft-file contents.
 */
export declare function normalizeOverlay(raw: unknown): EditOverlay;
/** Insert a building into the world (objects + chunk registration). */
export declare function addBuildingToWorld(world: MapWorld, building: BuildingInfo): void;
/** Remove a building from the world (objects + chunk registration). */
export declare function removeBuildingFromWorld(world: MapWorld, id: string): void;
/** Replace a building's data in place (position may have changed chunks). */
export declare function replaceBuildingInWorld(world: MapWorld, building: BuildingInfo): void;
/** Insert a POI into the world (objects + chunk registration). */
export declare function addPoiToWorld(world: MapWorld, poi: PoiInfo): void;
/** Remove a POI from the world (objects + chunk registration). */
export declare function removePoiFromWorld(world: MapWorld, id: string): void;
/** Apply a saved overlay onto a freshly generated world. */
export declare function applyEditOverlay(world: MapWorld, overlay: EditOverlay): void;
/** Rotate a footprint around its centroid by `radians` (returns new points). */
export declare function rotateFootprint(building: BuildingInfo, radians: number): BuildingInfo['footprint'];
/** Translate a footprint (and return it) so the building centers on (x, z). */
export declare function moveFootprint(building: BuildingInfo, x: number, z: number): BuildingInfo['footprint'];
