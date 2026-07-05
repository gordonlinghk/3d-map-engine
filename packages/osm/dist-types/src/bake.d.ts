import type { BBox, OsmResponse } from './types';
/** Split a bbox into a row-major grid of tiles no larger than `tileKm`. */
export declare function splitBBox(bbox: BBox, tileKm: number): BBox[];
/** Merge Overpass responses, de-duplicating elements by type + id. */
export declare function mergeOsmResponses(responses: OsmResponse[]): OsmResponse;
export type TiledFetchProgress = {
    /** 1-based index of the tile that just finished. */
    tile: number;
    tiles: number;
    bbox: BBox;
    /** Element count of this tile's response. */
    elements: number;
    attempt: number;
};
export type TiledFetchOptions = {
    /** Max tile edge in km (default 1.2 — a comfortable single Overpass call). */
    tileKm?: number;
    /** Pause between tile requests in ms (default 1500 — public-server etiquette). */
    delayMs?: number;
    /** Retry attempts per tile after the first try (default 3, backoff 5s/15s/45s). */
    retries?: number;
    onProgress?: (progress: TiledFetchProgress) => void;
    /** Injectable for tests. */
    fetchArea?: (bbox: BBox) => Promise<OsmResponse>;
    sleep?: (ms: number) => Promise<void>;
};
/**
 * Fetch a large area tile by tile and return one merged OsmResponse, ready
 * for `osmToWorld(merged, { name, bbox })` with the full bbox.
 */
export declare function fetchOsmAreaTiled(bbox: BBox, options?: TiledFetchOptions): Promise<OsmResponse>;
