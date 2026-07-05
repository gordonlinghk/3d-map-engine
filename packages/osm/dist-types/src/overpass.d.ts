import type { BBox, OsmResponse } from './types';
export declare function buildOverpassQuery(bbox: BBox): string;
/** Fetch an area from the Overpass API (browser and Node 18+). */
export declare function fetchOsmArea(bbox: BBox, options?: {
    endpoint?: string;
    signal?: AbortSignal;
}): Promise<OsmResponse>;
