/**
 * Terrarium DEM tiles (Tilezen / AWS Terrain Tiles, s3 elevation-tiles-prod):
 * Web-Mercator PNG tiles where elevation = (R·256 + G + B/256) − 32768 metres.
 * Free, keyless, attribution required ("Tilezen / Mapzen Terrain Tiles, AWS").
 */
import type { BBox } from './types';
export declare const TERRARIUM_ENDPOINT = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
export declare const TERRAIN_ATTRIBUTION = "Terrain: Mapzen/Tilezen terrain tiles (AWS Open Data)";
export declare const TILE_SIZE = 256;
/** Continuous Web-Mercator tile coordinates at a zoom level. */
export declare function lonToTileX(lon: number, zoom: number): number;
export declare function latToTileY(lat: number, zoom: number): number;
/** Integer tile range covering a bbox at a zoom level. */
export declare function tileRangeForBBox(bbox: BBox, zoom: number): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    count: number;
};
/**
 * Highest zoom (≤ maxZoom) whose tile count for the bbox stays within budget.
 * z14 ≈ 9.6 m/px at the equator — plenty for 6.25 m chunk cells.
 */
export declare function zoomForBBox(bbox: BBox, maxTiles?: number, maxZoom?: number): number;
export type DecodedPng = {
    width: number;
    height: number;
    /** RGBA bytes, row-major. */
    data: Uint8Array | Uint8ClampedArray;
};
/** Decode one terrarium pixel from RGBA data. */
export declare function terrariumElevation(data: DecodedPng['data'], pixelIndex: number): number;
export type ElevationGrid = {
    /** Elevation in metres, row-major, width×height. */
    elevations: Float32Array;
    width: number;
    height: number;
    zoom: number;
    /** Mercator tile-space origin of the grid (top-left), in continuous tile units. */
    originTileX: number;
    originTileY: number;
    /** Bilinear elevation lookup; clamps to the grid edge. */
    sample(lat: number, lon: number): number;
};
/** Assemble decoded tiles into one mosaic grid with a (lat, lon) sampler. */
export declare function createElevationGrid(tiles: Array<{
    x: number;
    y: number;
    png: DecodedPng;
}>, range: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}, zoom: number): ElevationGrid;
