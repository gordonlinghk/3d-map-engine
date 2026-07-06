import { describe, expect, it } from 'vitest';
import { serializeMap, deserializeMap } from './serialize';
import { getPresetConfig } from './presets';
import type { MapWorld } from './types';
import { SERIALIZATION_VERSION, chunkKey } from './types';

function sampleWorld(): MapWorld {
  const coord = { cx: 0, cz: 0 };
  return {
    id: 'world-test',
    seed: 'test-seed',
    config: getPresetConfig('coastal-tech-city'),
    chunks: {
      [chunkKey(coord)]: {
        coord,
        heights: [0, 1, 2, 3],
        resolution: 1,
        objectIds: ['bldg-1'],
      },
    },
    objects: {
      'bldg-1': {
        objectType: 'building',
        id: 'bldg-1',
        building: {
          id: 'bldg-1',
          name: 'Test Tower',
          type: 'company',
          description: 'A test building',
          districtId: 'district-1',
          position: { x: 10, y: 0, z: 20 },
          footprint: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
          height: 42,
          floors: 12,
          tags: ['AI', 'Landmark'],
          source: 'procedural',
          metadata: { founded: 2009, valuation: '~$10B', public: true },
        },
      },
      'poi:user:1': {
        objectType: 'poi',
        id: 'poi:user:1',
        poi: {
          id: 'poi:user:1',
          name: 'Meeting point',
          description: 'gather here',
          icon: 'flag',
          position: { x: 30, y: 2, z: 40 },
          tags: ['Custom'],
          source: 'user-defined',
        },
      },
    },
    blocks: [{ i: 0, j: 0, center: { x: 20, y: 20 }, kind: 'downtown' }],
    districts: [
      {
        id: 'district-1',
        name: 'Test District',
        kind: 'downtown',
        boundary: [
          { x: -50, y: -50 },
          { x: 50, y: -50 },
          { x: 50, y: 50 },
          { x: -50, y: 50 },
        ],
        center: { x: 0, y: 0 },
      },
    ],
    roadGraph: {
      nodes: [
        { id: 'n1', position: { x: 0, y: 0, z: 0 } },
        { id: 'n2', position: { x: 100, y: 0, z: 0 } },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', kind: 'avenue', width: 8 }],
    },
    landmarks: [
      {
        id: 'lm-1',
        name: 'Test Bridge',
        kind: 'bridge',
        description: 'A test bridge',
        position: { x: 50, y: 5, z: 50 },
        tags: ['Landmark'],
      },
    ],
  };
}

describe('serializeMap / deserializeMap', () => {
  it('round-trips a world without losing data', () => {
    const world = sampleWorld();
    const restored = deserializeMap(serializeMap(world));
    expect(restored).toEqual(world);
  });

  it('survives JSON stringify/parse (schema-friendly)', () => {
    const world = sampleWorld();
    const json = JSON.stringify(serializeMap(world));
    const restored = deserializeMap(JSON.parse(json));
    expect(restored).toEqual(world);
  });

  it('snapshot is decoupled from later world mutations', () => {
    const world = sampleWorld();
    const snapshot = serializeMap(world);
    world.landmarks.push({
      id: 'lm-2',
      name: 'Later Tower',
      kind: 'tower',
      description: 'added after snapshot',
      position: { x: 0, y: 0, z: 0 },
      tags: [],
    });
    expect(snapshot.world.landmarks).toHaveLength(1);
  });

  it('rejects unknown serialization versions', () => {
    const world = sampleWorld();
    const data = serializeMap(world);
    const bad = { ...data, version: 999 } as unknown as ReturnType<typeof serializeMap>;
    expect(() => deserializeMap(bad)).toThrow(/version/i);
    expect(data.version).toBe(SERIALIZATION_VERSION);
  });
});
