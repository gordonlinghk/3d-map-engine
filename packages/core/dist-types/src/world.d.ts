import { type HeightSampler } from './terrain';
import type { ChunkCoord, MapChunk, MapConfig, MapWorld } from './types';
export declare const CHUNK_RESOLUTION = 32;
/** World-space origin: the map is centered on (0, 0). */
export declare function chunkOrigin(config: MapConfig, coord: ChunkCoord): {
    x: number;
    z: number;
};
export declare function generateWorld(seed: string, config: MapConfig): MapWorld;
/**
 * Generate (or re-generate) a single chunk. Depends only on (seed, config,
 * coord) — never on which chunks were generated before it.
 */
export declare function generateChunk(world: MapWorld, coord: ChunkCoord): MapChunk;
/**
 * Height sampler for a world. Samples the chunk height grids (bilinear), so
 * it matches the rendered terrain mesh exactly and also works for imported
 * worlds (e.g. OSM) whose heights never came from the procedural function.
 * Falls back to the procedural terrain function outside the chunk grid.
 */
export declare function createWorldHeightSampler(world: MapWorld): HeightSampler;
