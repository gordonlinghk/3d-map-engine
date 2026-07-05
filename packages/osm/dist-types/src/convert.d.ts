import type { MapWorld, Vec2 } from '@map-engine/core';
import type { BBox, OsmResponse } from './types';
/** Flat ground height for imported cities (no elevation data in v1). */
export declare const OSM_GROUND = 2;
export type OsmConvertOptions = {
    /** Display name, e.g. "Tokyo Shibuya". */
    name: string;
    bbox: BBox;
    /** Cap on scattered park trees. */
    maxTrees?: number;
};
export declare function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean;
export declare function osmToWorld(data: OsmResponse, options: OsmConvertOptions): MapWorld;
export type { OsmResponse };
