import { describe, expect, it } from 'vitest';
import { osmToWorld, OSM_GROUND, pointInPolygon } from './convert';
import { buildOverpassQuery } from './overpass';
import type { BBox, OsmResponse } from './types';

// ~1.1km x 0.9km box around (0, 0) for easy math.
const BBOX: BBox = [-0.004, -0.005, 0.004, 0.005];

function fixture(): OsmResponse {
  return {
    elements: [
      // Square named office building (~40x40m) around the center.
      { type: 'node', id: 1, lat: 0.0002, lon: 0.0002 },
      { type: 'node', id: 2, lat: 0.0002, lon: -0.0002 },
      { type: 'node', id: 3, lat: -0.0002, lon: -0.0002 },
      { type: 'node', id: 4, lat: -0.0002, lon: 0.0002 },
      {
        type: 'way',
        id: 100,
        nodes: [1, 2, 3, 4, 1],
        tags: { building: 'office', name: 'Test Tower', height: '48', 'addr:street': 'Main St', 'addr:housenumber': '1' },
      },
      // Residential building with levels only.
      { type: 'node', id: 5, lat: 0.001, lon: 0.001 },
      { type: 'node', id: 6, lat: 0.001, lon: 0.0014 },
      { type: 'node', id: 7, lat: 0.0014, lon: 0.0014 },
      { type: 'node', id: 8, lat: 0.0014, lon: 0.001 },
      {
        type: 'way',
        id: 101,
        nodes: [5, 6, 7, 8, 5],
        tags: { building: 'apartments', 'building:levels': '6' },
      },
      // Tiny shed — filtered out by area.
      { type: 'node', id: 9, lat: 0.002, lon: 0.002 },
      { type: 'node', id: 10, lat: 0.002, lon: 0.00201 },
      { type: 'node', id: 11, lat: 0.00201, lon: 0.00201 },
      { type: 'way', id: 102, nodes: [9, 10, 11, 9], tags: { building: 'shed' } },
      // A primary road through two segments (3 shared nodes).
      { type: 'node', id: 20, lat: -0.002, lon: -0.003 },
      { type: 'node', id: 21, lat: 0, lon: 0.0005 },
      { type: 'node', id: 22, lat: 0.002, lon: 0.003 },
      { type: 'way', id: 200, nodes: [20, 21, 22], tags: { highway: 'primary' } },
      // A footway — skipped.
      { type: 'way', id: 201, nodes: [20, 22], tags: { highway: 'footway' } },
      // A pond.
      { type: 'node', id: 30, lat: -0.0015, lon: 0.002 },
      { type: 'node', id: 31, lat: -0.0015, lon: 0.003 },
      { type: 'node', id: 32, lat: -0.0025, lon: 0.003 },
      { type: 'node', id: 33, lat: -0.0025, lon: 0.002 },
      { type: 'way', id: 300, nodes: [30, 31, 32, 33, 30], tags: { natural: 'water' } },
      // A park (big enough for trees).
      { type: 'node', id: 40, lat: 0.0015, lon: -0.003 },
      { type: 'node', id: 41, lat: 0.0015, lon: -0.0015 },
      { type: 'node', id: 42, lat: 0.003, lon: -0.0015 },
      { type: 'node', id: 43, lat: 0.003, lon: -0.003 },
      { type: 'way', id: 400, nodes: [40, 41, 42, 43, 40], tags: { leisure: 'park' } },
    ],
  };
}

describe('osmToWorld', () => {
  const world = osmToWorld(fixture(), { name: 'Test City', bbox: BBOX });

  it('converts buildings with height, levels and area filtering', () => {
    const buildings = Object.values(world.objects).filter((o) => o.objectType === 'building');
    expect(buildings).toHaveLength(2); // shed filtered

    const tower = world.objects['bldg:osm:100'];
    expect(tower?.objectType).toBe('building');
    if (tower?.objectType !== 'building') return;
    expect(tower.building.name).toBe('Test Tower');
    expect(tower.building.height).toBe(48);
    expect(tower.building.type).toBe('company');
    expect(tower.building.source).toBe('imported');
    expect(tower.building.metadata?.imported).toBe(true);
    expect(tower.building.metadata?.address).toBe('1 Main St');
    // Centered near origin, footprint is a real polygon.
    expect(Math.abs(tower.building.position.x)).toBeLessThan(1);
    expect(tower.building.footprint.length).toBe(4);

    const flats = world.objects['bldg:osm:101'];
    if (flats?.objectType !== 'building') throw new Error('missing building 101');
    expect(flats.building.floors).toBe(6);
    expect(flats.building.height).toBeCloseTo(19.2, 3);
    expect(flats.building.type).toBe('residential');
  });

  it('converts roads with shared nodes and skips footways', () => {
    expect(world.roadGraph.edges).toHaveLength(2);
    expect(world.roadGraph.edges.every((e) => e.kind === 'avenue')).toBe(true);
    // Shared middle node connects the two segments.
    const nodeIds = world.roadGraph.nodes.map((n) => n.id);
    expect(new Set(nodeIds).size).toBe(3);
  });

  it('extracts water and green polygons and scatters park trees', () => {
    expect(world.waterPolygons).toHaveLength(1);
    expect(world.greenPolygons).toHaveLength(1);
    const trees = Object.values(world.objects).filter((o) => o.objectType === 'tree');
    expect(trees.length).toBeGreaterThan(3);
    // All trees are inside the park polygon.
    for (const t of trees) {
      if (t.objectType !== 'tree') continue;
      expect(pointInPolygon({ x: t.position.x, y: t.position.z }, world.greenPolygons![0]!)).toBe(
        true,
      );
    }
  });

  it('builds flat chunks covering the bbox and registers objects', () => {
    const chunkCount = Object.keys(world.chunks).length;
    expect(chunkCount).toBe(world.config.chunksX * world.config.chunksZ);
    const someChunk = Object.values(world.chunks)[0]!;
    expect(someChunk.heights.every((h) => h === OSM_GROUND)).toBe(true);
    const assigned = Object.values(world.chunks).flatMap((c) => c.objectIds);
    expect(assigned.length).toBe(Object.keys(world.objects).length);
  });

  it('is deterministic', () => {
    const again = osmToWorld(fixture(), { name: 'Test City', bbox: BBOX });
    expect(again).toEqual(world);
  });
});

describe('buildOverpassQuery', () => {
  it('embeds the bbox and requests buildings, highways, water and parks', () => {
    const q = buildOverpassQuery([1, 2, 3, 4]);
    expect(q).toContain('[bbox:1,2,3,4]');
    for (const clause of ['way["building"]', 'way["highway"]', 'natural"="water', 'leisure']) {
      expect(q).toContain(clause);
    }
  });
});
