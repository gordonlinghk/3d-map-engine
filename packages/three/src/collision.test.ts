import { describe, expect, it } from 'vitest';
import { createColliderIndex } from './collision';
import type { MapWorld } from '@map-engine/core';

/** Minimal world with one 10x10 building centered at (0, 0). */
function worldWithBuilding(): MapWorld {
  return {
    id: 'w',
    seed: 's',
    config: {
      preset: 'coastal-tech-city',
      chunkSize: 200,
      chunksX: 8,
      chunksZ: 8,
      waterLevel: 0,
      terrain: { maxHeight: 60, hilliness: 0.5, islandFactor: 0.5 },
      city: { blockSize: 40, buildingDensity: 0.5, maxFloors: 40 },
    },
    chunks: {},
    objects: {
      b1: {
        objectType: 'building',
        id: 'b1',
        building: {
          id: 'b1',
          name: 'Block',
          type: 'company',
          description: '',
          districtId: 'd',
          position: { x: 0, y: 0, z: 0 },
          footprint: [
            { x: -5, y: -5 },
            { x: 5, y: -5 },
            { x: 5, y: 5 },
            { x: -5, y: 5 },
          ],
          height: 30,
          floors: 10,
          tags: [],
          source: 'procedural',
        },
      },
    },
    districts: [],
    blocks: [],
    roadGraph: { nodes: [], edges: [] },
    landmarks: [],
  };
}

describe('createColliderIndex', () => {
  const RADIUS = 0.8;

  it('indexes buildings and solid landmarks', () => {
    const world = worldWithBuilding();
    world.landmarks.push({
      id: 'lm',
      name: 'Tower',
      kind: 'tower',
      description: '',
      position: { x: 100, y: 0, z: 100 },
      tags: [],
    });
    expect(createColliderIndex(world).size).toBe(2);
  });

  it('bridges and parks are not solid', () => {
    const world = worldWithBuilding();
    world.landmarks.push(
      { id: 'br', name: 'B', kind: 'bridge', description: '', position: { x: 50, y: 0, z: 0 }, tags: [] },
      { id: 'pk', name: 'P', kind: 'park', description: '', position: { x: -50, y: 0, z: 0 }, tags: [] },
    );
    expect(createColliderIndex(world).size).toBe(1);
  });

  it('blocks walking straight into a wall', () => {
    const idx = createColliderIndex(worldWithBuilding());
    // Approach the south wall (z = -5) from below.
    const r = idx.resolveMovement(0, -10, 0, -2, RADIUS);
    expect(r.x).toBe(0);
    expect(r.z).toBeCloseTo(-5 - RADIUS, 5);
  });

  it('slides along a wall when moving diagonally', () => {
    const idx = createColliderIndex(worldWithBuilding());
    // Moving north-east into the south wall: z clamps, x keeps moving.
    const r = idx.resolveMovement(-2, -6.5, 0, -4, RADIUS);
    expect(r.x).toBe(0);
    expect(r.z).toBeCloseTo(-5 - RADIUS, 5);
  });

  it('leaves free movement untouched', () => {
    const idx = createColliderIndex(worldWithBuilding());
    const r = idx.resolveMovement(20, 20, 25, 30, RADIUS);
    expect(r).toEqual({ x: 25, z: 30 });
  });

  it('never ends up inside the box from any approach angle', () => {
    const idx = createColliderIndex(worldWithBuilding());
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const fx = Math.cos(a) * 12;
      const fz = Math.sin(a) * 12;
      // March toward the center in small steps, like the frame loop does.
      let x = fx;
      let z = fz;
      for (let s = 0; s < 40; s++) {
        const next = idx.resolveMovement(x, z, x - Math.cos(a) * 0.4, z - Math.sin(a) * 0.4, RADIUS);
        x = next.x;
        z = next.z;
      }
      const inside = x > -5 && x < 5 && z > -5 && z < 5;
      expect(inside, `angle ${a.toFixed(2)} ended inside`).toBe(false);
    }
  });
});
