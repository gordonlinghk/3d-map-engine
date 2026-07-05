import { describe, expect, it } from 'vitest';
import { CHUNK_RESOLUTION, chunkKey } from '@map-engine/core';
import type { MapWorld } from '@map-engine/core';
import { applyTerrainToWorld } from './apply';
import { fetchElevationGrid } from './fetch';
import {
  TILE_SIZE,
  latToTileY,
  lonToTileX,
  terrariumElevation,
  tileRangeForBBox,
  zoomForBBox,
} from './terrarium';
import type { BBox, DecodedPng } from './index';

/** Synthetic terrarium tile where every pixel encodes `elevation`. */
function flatTile(elevation: number): DecodedPng {
  const value = Math.round((elevation + 32768) * 256);
  const r = Math.floor(value / 65536) % 256;
  const g = Math.floor(value / 256) % 256;
  const b = value % 256;
  const data = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: TILE_SIZE, height: TILE_SIZE, data };
}

const HK: BBox = [22.265, 114.14, 22.295, 114.175];

describe('tile math', () => {
  it('maps known coordinates to web-mercator tiles', () => {
    // Greenwich at z1 sits at the tile seam.
    expect(lonToTileX(0, 1)).toBeCloseTo(1, 10);
    expect(latToTileY(0, 1)).toBeCloseTo(1, 10);
    // Hong Kong at z10 sits in tile x=836, y=446 (standard slippy scheme).
    expect(Math.floor(lonToTileX(114.16, 10))).toBe(836);
    expect(Math.floor(latToTileY(22.28, 10))).toBe(446);
  });

  it('picks the highest zoom within the tile budget', () => {
    // Small bbox: capped by maxZoom, still within budget.
    const z = zoomForBBox(HK, 16);
    expect(z).toBe(14);
    expect(tileRangeForBBox(HK, z).count).toBeLessThanOrEqual(16);
    // Country-sized bbox: the budget binds and forces a lower zoom.
    const china: BBox = [18, 73, 54, 135];
    const zc = zoomForBBox(china, 16);
    expect(tileRangeForBBox(china, zc).count).toBeLessThanOrEqual(16);
    expect(tileRangeForBBox(china, zc + 1).count).toBeGreaterThan(16);
    expect(zc).toBeLessThan(8);
  });

  it('decodes terrarium pixels', () => {
    const tile = flatTile(123.5);
    expect(terrariumElevation(tile.data, 0)).toBeCloseTo(123.5, 2);
    const sea = flatTile(-30);
    expect(terrariumElevation(sea.data, 100)).toBeCloseTo(-30, 2);
  });
});

describe('fetchElevationGrid', () => {
  it('fetches every tile in range and samples bilinearly', async () => {
    const urls: string[] = [];
    const grid = await fetchElevationGrid(HK, {
      zoom: 12,
      fetchFn: ((url: string) => {
        urls.push(url);
        return Promise.resolve(new Response(new ArrayBuffer(1), { status: 200 }));
      }) as typeof fetch,
      decodePng: () => Promise.resolve(flatTile(50)),
    });
    const range = tileRangeForBBox(HK, 12);
    expect(urls).toHaveLength(range.count);
    expect(urls[0]).toMatch(/\/12\/\d+\/\d+\.png$/);
    expect(grid.sample(22.28, 114.16)).toBeCloseTo(50, 1);
  });

  it('throws a readable error on a failed tile', async () => {
    await expect(
      fetchElevationGrid(HK, {
        zoom: 12,
        fetchFn: (() => Promise.resolve(new Response('', { status: 403 }))) as typeof fetch,
        decodePng: () => Promise.resolve(flatTile(0)),
      }),
    ).rejects.toThrow(/HTTP 403/);
  });
});

/** Minimal flat imported-style world: 2×2 chunks, one building, road, water. */
function makeFlatWorld(): { world: MapWorld; bbox: BBox } {
  const chunkSize = 200;
  const chunks: MapWorld['chunks'] = {};
  for (let cz = 0; cz < 2; cz++) {
    for (let cx = 0; cx < 2; cx++) {
      chunks[chunkKey({ cx, cz })] = {
        coord: { cx, cz },
        heights: new Array((CHUNK_RESOLUTION + 1) ** 2).fill(2) as number[],
        resolution: CHUNK_RESOLUTION,
        objectIds: [],
      };
    }
  }
  const world: MapWorld = {
    id: 'osm:test',
    seed: 'osm-test',
    config: {
      preset: 'downtown-night-grid',
      chunkSize,
      chunksX: 2,
      chunksZ: 2,
      waterLevel: 0,
      terrain: { maxHeight: 25, hilliness: 0, islandFactor: 0.1 },
      city: { blockSize: 40, buildingDensity: 0.5, maxFloors: 60 },
    },
    chunks,
    objects: {
      'bldg:osm:1': {
        objectType: 'building',
        id: 'bldg:osm:1',
        building: {
          id: 'bldg:osm:1',
          name: 'Test',
          type: 'company',
          description: '',
          districtId: 'd:osm',
          position: { x: 50, y: 2, z: 50 },
          footprint: [
            { x: 40, y: 40 },
            { x: 60, y: 40 },
            { x: 60, y: 60 },
            { x: 40, y: 60 },
          ],
          height: 20,
          floors: 6,
          tags: [],
          source: 'imported',
        },
      },
      'tree:osm:0': {
        objectType: 'tree',
        id: 'tree:osm:0',
        name: 'Tree',
        position: { x: -80, y: 2, z: -80 },
        tags: [],
      },
    },
    districts: [],
    blocks: [],
    roadGraph: {
      nodes: [{ id: 'rn:1', position: { x: 0, y: 2, z: 0 } }],
      edges: [],
    },
    landmarks: [],
    waterPolygons: [
      [
        { x: -180, y: -180 },
        { x: -100, y: -180 },
        { x: -100, y: -100 },
        { x: -180, y: -100 },
      ],
    ],
    greenPolygons: [],
  };
  // World spans 400 m ≈ 0.0036° — bbox centred anywhere works.
  const bbox: BBox = [22.278, 114.156, 22.2816, 114.1599];
  return { world, bbox };
}

describe('applyTerrainToWorld', () => {
  it('writes relative elevation, marks sea, settles objects and roads', () => {
    const { world, bbox } = makeFlatWorld();
    // East half is a 120 m hill rising from 20 m; west edge is sea.
    const sampler = (_lat: number, lon: number): number => {
      const t = (lon - bbox[1]) / (bbox[3] - bbox[1]); // 0..1 west→east
      if (t < 0.1) return 0; // sea strip
      return 20 + t * 120;
    };
    const stats = applyTerrainToWorld(world, sampler, { bbox });

    expect(stats.baseElevation).toBeGreaterThanOrEqual(20);
    expect(stats.seaFraction).toBeGreaterThan(0.03);
    const allHeights = Object.values(world.chunks).flatMap((c) => c.heights);
    expect(Math.min(...allHeights)).toBeLessThan(0); // sea below waterLevel
    expect(Math.max(...allHeights)).toBeGreaterThan(80); // hill in world units

    // Building settled onto its (sloped) ground, not floating at y=2.
    const b = world.objects['bldg:osm:1'];
    expect(b?.objectType === 'building' && b.building.position.y).toBeGreaterThan(10);
    const node = world.roadGraph.nodes[0]!;
    expect(node.position.y).toBeGreaterThan(10);
    // Attribution recorded for the UI.
    expect(world.attribution?.join(' ')).toMatch(/[Tt]errain/);
    // Colour banding keeps up with the new relief.
    expect(world.config.terrain.maxHeight).toBeGreaterThan(80);
  });

  it('flattens the terrain under water polygons to a single bed level', () => {
    const { world, bbox } = makeFlatWorld();
    // Steep gradient everywhere — without flattening, the lake would slope.
    const sampler = (_lat: number, lon: number): number =>
      30 + ((lon - bbox[1]) / (bbox[3] - bbox[1])) * 200;
    applyTerrainToWorld(world, sampler, { bbox });

    const { chunkSize, chunksX } = world.config;
    const half = (chunksX * chunkSize) / 2;
    const res = CHUNK_RESOLUTION;
    const inside: number[] = [];
    for (const chunk of Object.values(world.chunks)) {
      for (let j = 0; j <= res; j++) {
        for (let i = 0; i <= res; i++) {
          const x = chunk.coord.cx * chunkSize + (i / res) * chunkSize - half;
          const z = chunk.coord.cz * chunkSize + (j / res) * chunkSize - half;
          if (x > -170 && x < -110 && z > -170 && z < -110) {
            inside.push(chunk.heights[j * (res + 1) + i]!);
          }
        }
      }
    }
    expect(inside.length).toBeGreaterThan(4);
    const spread = Math.max(...inside) - Math.min(...inside);
    expect(spread).toBeLessThan(0.01); // flat bed
  });
});
