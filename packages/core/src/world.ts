import { createHeightSampler, type HeightSampler } from './terrain';
import { generateRoadGraph } from './roads';
import type { ChunkCoord, MapChunk, MapConfig, MapWorld } from './types';
import { chunkKey } from './types';

export const CHUNK_RESOLUTION = 32;

/** World-space origin: the map is centered on (0, 0). */
export function chunkOrigin(config: MapConfig, coord: ChunkCoord): { x: number; z: number } {
  const halfX = (config.chunksX * config.chunkSize) / 2;
  const halfZ = (config.chunksZ * config.chunkSize) / 2;
  return { x: coord.cx * config.chunkSize - halfX, z: coord.cz * config.chunkSize - halfZ };
}

function buildChunk(sampler: HeightSampler, config: MapConfig, coord: ChunkCoord): MapChunk {
  const res = CHUNK_RESOLUTION;
  const origin = chunkOrigin(config, coord);
  const stepSize = config.chunkSize / res;
  const heights: number[] = new Array((res + 1) * (res + 1));
  for (let j = 0; j <= res; j++) {
    for (let i = 0; i <= res; i++) {
      heights[j * (res + 1) + i] = sampler(origin.x + i * stepSize, origin.z + j * stepSize);
    }
  }
  return { coord, heights, resolution: res, objectIds: [] };
}

export function generateWorld(seed: string, config: MapConfig): MapWorld {
  const sampler = createHeightSampler(seed, config);
  const chunks: MapWorld['chunks'] = {};
  for (let cz = 0; cz < config.chunksZ; cz++) {
    for (let cx = 0; cx < config.chunksX; cx++) {
      const coord = { cx, cz };
      chunks[chunkKey(coord)] = buildChunk(sampler, config, coord);
    }
  }
  return {
    id: `world:${seed}:${config.preset}`,
    seed,
    config: structuredClone(config),
    chunks,
    objects: {},
    districts: [],
    roadGraph: generateRoadGraph(seed, config, sampler),
    landmarks: [],
  };
}

/**
 * Generate (or re-generate) a single chunk. Depends only on (seed, config,
 * coord) — never on which chunks were generated before it.
 */
export function generateChunk(world: MapWorld, coord: ChunkCoord): MapChunk {
  return buildChunk(createHeightSampler(world.seed, world.config), world.config, coord);
}

/** Reusable exact height sampler for a world (terrain function, not mesh). */
export function createWorldHeightSampler(world: MapWorld): HeightSampler {
  return createHeightSampler(world.seed, world.config);
}
