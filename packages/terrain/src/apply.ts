import { createWorldHeightSampler } from '@map-engine/core';
import type { MapWorld, Vec2 } from '@map-engine/core';
import { TERRAIN_ATTRIBUTION } from './terrarium';
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

function polygonBounds(poly: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

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
export function applyTerrainToWorld(
  world: MapWorld,
  sample: (lat: number, lon: number) => number,
  options: ApplyTerrainOptions,
): ApplyTerrainResult {
  const {
    bbox,
    seaLevelThreshold = 0.05,
    seaY = -1.6,
    groundOffset = 2,
    exaggeration = 1,
  } = options;
  const [s, w, n, e] = bbox;
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const { chunkSize, chunksX, chunksZ } = world.config;
  const halfX = (chunksX * chunkSize) / 2;
  const halfZ = (chunksZ * chunkSize) / 2;

  const elevationAt = (x: number, z: number): number =>
    sample(lat0 - z / mPerDegLat, lon0 + x / mPerDegLon);

  // Pass 1: collect elevations per chunk sample; find the land floor.
  const perChunk = new Map<string, Float32Array>();
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let minLand = Infinity;
  let seaSamples = 0;
  let totalSamples = 0;
  for (const [key, chunk] of Object.entries(world.chunks)) {
    const res = chunk.resolution;
    const elevs = new Float32Array((res + 1) ** 2);
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const x = chunk.coord.cx * chunkSize + (i / res) * chunkSize - halfX;
        const z = chunk.coord.cz * chunkSize + (j / res) * chunkSize - halfZ;
        const elev = elevationAt(x, z);
        elevs[j * (res + 1) + i] = elev;
        minElevation = Math.min(minElevation, elev);
        maxElevation = Math.max(maxElevation, elev);
        totalSamples += 1;
        if (elev <= seaLevelThreshold) seaSamples += 1;
        else minLand = Math.min(minLand, elev);
      }
    }
    perChunk.set(key, elevs);
  }
  const baseElevation = Number.isFinite(minLand) ? Math.max(0, minLand) : 0;

  // Pass 2: write world heights.
  for (const [key, chunk] of Object.entries(world.chunks)) {
    const elevs = perChunk.get(key)!;
    for (let k = 0; k < elevs.length; k++) {
      const elev = elevs[k]!;
      chunk.heights[k] =
        elev <= seaLevelThreshold ? seaY : groundOffset + (elev - baseElevation) * exaggeration;
    }
  }

  // Pass 3: flatten terrain under water polygons (lakes/rivers are flat).
  const waterPolys = world.waterPolygons ?? [];
  for (const poly of waterPolys) {
    const bounds = polygonBounds(poly);
    let level = Infinity;
    const clampTargets: Array<{ heights: number[]; index: number }> = [];
    for (const chunk of Object.values(world.chunks)) {
      const res = chunk.resolution;
      const originX = chunk.coord.cx * chunkSize - halfX;
      const originZ = chunk.coord.cz * chunkSize - halfZ;
      if (
        originX > bounds.maxX ||
        originX + chunkSize < bounds.minX ||
        originZ > bounds.maxY ||
        originZ + chunkSize < bounds.minY
      ) {
        continue;
      }
      for (let j = 0; j <= res; j++) {
        for (let i = 0; i <= res; i++) {
          const x = originX + (i / res) * chunkSize;
          const z = originZ + (j / res) * chunkSize;
          if (x < bounds.minX || x > bounds.maxX || z < bounds.minY || z > bounds.maxY) continue;
          if (!pointInPolygon({ x, y: z }, poly)) continue;
          const index = j * (res + 1) + i;
          level = Math.min(level, chunk.heights[index]!);
          clampTargets.push({ heights: chunk.heights, index });
        }
      }
    }
    if (!Number.isFinite(level)) {
      // Polygon smaller than the height-grid cell — level from its vertices.
      level = Math.min(...poly.map((p) => {
        const elev = elevationAt(p.x, p.y);
        return elev <= seaLevelThreshold ? seaY : groundOffset + (elev - baseElevation) * exaggeration;
      }));
    }
    const bed = level - 0.7;
    for (const t of clampTargets) t.heights[t.index] = Math.min(t.heights[t.index]!, bed);
  }

  // Pass 4: settle objects and road nodes onto the new ground.
  const ground = createWorldHeightSampler(world);
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'building') {
      const b = obj.building;
      let lowest = ground(b.position.x, b.position.z);
      for (const p of b.footprint) lowest = Math.min(lowest, ground(p.x, p.y));
      b.position.y = Math.max(lowest, world.config.waterLevel) - 0.2;
    } else if (obj.objectType === 'tree') {
      obj.position.y = Math.max(ground(obj.position.x, obj.position.z), world.config.waterLevel);
    } else if (obj.objectType === 'poi') {
      const p = obj.poi.position;
      p.y = Math.max(ground(p.x, p.z), world.config.waterLevel);
    }
  }
  for (const node of world.roadGraph.nodes) {
    node.position.y = Math.max(ground(node.position.x, node.position.z), world.config.waterLevel + 0.3);
  }

  // Keep the height-band colouring meaningful and record attribution.
  world.config.terrain.maxHeight = Math.max(
    world.config.terrain.maxHeight,
    groundOffset + (maxElevation - baseElevation) * exaggeration,
  );
  world.attribution = [...(world.attribution ?? []), TERRAIN_ATTRIBUTION];

  return { minElevation, maxElevation, baseElevation, seaFraction: seaSamples / totalSamples };
}
