/**
 * Terrarium DEM tiles (Tilezen / AWS Terrain Tiles, s3 elevation-tiles-prod):
 * Web-Mercator PNG tiles where elevation = (R·256 + G + B/256) − 32768 metres.
 * Free, keyless, attribution required ("Tilezen / Mapzen Terrain Tiles, AWS").
 */
import type { BBox } from './types';

export const TERRARIUM_ENDPOINT = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
export const TERRAIN_ATTRIBUTION = 'Terrain: Mapzen/Tilezen terrain tiles (AWS Open Data)';

export const TILE_SIZE = 256;

/** Continuous Web-Mercator tile coordinates at a zoom level. */
export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}
export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

/** Integer tile range covering a bbox at a zoom level. */
export function tileRangeForBBox(
  bbox: BBox,
  zoom: number,
): { x0: number; y0: number; x1: number; y1: number; count: number } {
  const [s, w, n, e] = bbox;
  const x0 = Math.floor(lonToTileX(w, zoom));
  const x1 = Math.floor(lonToTileX(e, zoom));
  const y0 = Math.floor(latToTileY(n, zoom)); // tile Y grows southward
  const y1 = Math.floor(latToTileY(s, zoom));
  return { x0, y0, x1, y1, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

/**
 * Highest zoom (≤ maxZoom) whose tile count for the bbox stays within budget.
 * z14 ≈ 9.6 m/px at the equator — plenty for 6.25 m chunk cells.
 */
export function zoomForBBox(bbox: BBox, maxTiles = 16, maxZoom = 14): number {
  for (let z = maxZoom; z > 0; z--) {
    if (tileRangeForBBox(bbox, z).count <= maxTiles) return z;
  }
  return 1;
}

export type DecodedPng = {
  width: number;
  height: number;
  /** RGBA bytes, row-major. */
  data: Uint8Array | Uint8ClampedArray;
};

/** Decode one terrarium pixel from RGBA data. */
export function terrariumElevation(data: DecodedPng['data'], pixelIndex: number): number {
  const i = pixelIndex * 4;
  return data[i]! * 256 + data[i + 1]! + data[i + 2]! / 256 - 32768;
}

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
export function createElevationGrid(
  tiles: Array<{ x: number; y: number; png: DecodedPng }>,
  range: { x0: number; y0: number; x1: number; y1: number },
  zoom: number,
): ElevationGrid {
  const cols = range.x1 - range.x0 + 1;
  const rows = range.y1 - range.y0 + 1;
  const width = cols * TILE_SIZE;
  const height = rows * TILE_SIZE;
  const elevations = new Float32Array(width * height);
  for (const tile of tiles) {
    const ox = (tile.x - range.x0) * TILE_SIZE;
    const oy = (tile.y - range.y0) * TILE_SIZE;
    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        elevations[(oy + py) * width + (ox + px)] = terrariumElevation(
          tile.png.data,
          py * tile.png.width + px,
        );
      }
    }
  }

  const sample = (lat: number, lon: number): number => {
    // Continuous pixel coordinates within the mosaic.
    const fx = (lonToTileX(lon, zoom) - range.x0) * TILE_SIZE - 0.5;
    const fy = (latToTileY(lat, zoom) - range.y0) * TILE_SIZE - 0.5;
    const x = Math.min(Math.max(fx, 0), width - 1.001);
    const y = Math.min(Math.max(fy, 0), height - 1.001);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const h00 = elevations[y0 * width + x0]!;
    const h10 = elevations[y0 * width + x0 + 1]!;
    const h01 = elevations[(y0 + 1) * width + x0]!;
    const h11 = elevations[(y0 + 1) * width + x0 + 1]!;
    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  };

  return { elevations, width, height, zoom, originTileX: range.x0, originTileY: range.y0, sample };
}
