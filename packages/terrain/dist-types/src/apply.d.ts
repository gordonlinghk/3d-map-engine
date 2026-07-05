import type { MapWorld } from '@map-engine/core';
import type { BBox } from './types';
export type ApplyTerrainOptions = {
    /** The geographic bbox the world was converted from (same as osmToWorld). */
    bbox: BBox;
    /** Elevations at/below this (metres) count as sea (terrarium sea = 0). */
    seaLevelThreshold?: number;
    /** World Y assigned to sea samples — below waterLevel so water renders. */
    seaY?: number;
    /** Ground offset added on top of relative elevation (matches OSM_GROUND). */
    groundOffset?: number;
    /** Multiply relative elevation (visual drama for strategy-scale maps). */
    exaggeration?: number;
};
export type ApplyTerrainResult = {
    minElevation: number;
    maxElevation: number;
    /** Elevation subtracted so the lowest land sits at groundOffset. */
    baseElevation: number;
    seaFraction: number;
};
/**
 * Write real elevation into a (flat) imported world, in place:
 *
 * 1. Chunk height grids get `groundOffset + (elevation − baseElevation)`,
 *    where baseElevation is the lowest land elevation (an inland city like
 *    Paris doesn't float 35 m above the origin). Sea samples get `seaY`
 *    (below waterLevel), so coasts and harbours finally render as water.
 * 2. Terrain under each water polygon is flattened to the polygon's lowest
 *    level — lakes and rivers are flat; the renderer drapes the water
 *    surface just above.
 * 3. Buildings settle onto the lowest ground under their footprint (never
 *    floating on a downhill edge); road nodes, trees and simulation follow
 *    the sampled ground.
 */
export declare function applyTerrainToWorld(world: MapWorld, sample: (lat: number, lon: number) => number, options: ApplyTerrainOptions): ApplyTerrainResult;
