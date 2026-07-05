import type { DecodedPng, ElevationGrid } from './terrarium';
import type { BBox } from './types';
export type FetchElevationOptions = {
    zoom?: number;
    maxTiles?: number;
    endpoint?: string;
    signal?: AbortSignal;
    /** Injectable for tests / Node. Browser default decodes via canvas. */
    fetchFn?: typeof fetch;
    decodePng?: (bytes: ArrayBuffer) => Promise<DecodedPng>;
};
/**
 * Fetch terrarium tiles covering a bbox and return a mosaic elevation grid.
 * Tiles are fetched concurrently — the AWS Open Data bucket is a plain CDN,
 * not a rate-limited community API.
 */
export declare function fetchElevationGrid(bbox: BBox, options?: FetchElevationOptions): Promise<ElevationGrid>;
