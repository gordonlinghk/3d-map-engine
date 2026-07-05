import { describe, expect, it } from 'vitest';
import {
  addBuildingToWorld,
  applyEditOverlay,
  emptyOverlay,
  moveFootprint,
  overlayIsEmpty,
  removeBuildingFromWorld,
  rotateFootprint,
} from './edits';
import { generateWorld } from './world';
import { getPresetConfig } from './presets';
import type { BuildingInfo } from './types';

function firstBuilding(world: ReturnType<typeof generateWorld>): BuildingInfo {
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'building') return obj.building;
  }
  throw new Error('no buildings');
}

function makeBuilding(id: string, x: number, z: number): BuildingInfo {
  return {
    id,
    name: 'User Tower',
    type: 'company',
    description: 'custom',
    districtId: 'd:downtown',
    position: { x, y: 5, z },
    footprint: [
      { x: x - 6, y: z - 6 },
      { x: x + 6, y: z - 6 },
      { x: x + 6, y: z + 6 },
      { x: x - 6, y: z + 6 },
    ],
    height: 31,
    floors: 10,
    tags: ['Custom'],
    source: 'user-defined',
  };
}

describe('edit overlay', () => {
  it('add/remove keeps objects and chunk registration consistent', () => {
    const world = generateWorld('edit-test', getPresetConfig('coastal-tech-city'));
    const before = Object.values(world.chunks).flatMap((c) => c.objectIds).length;

    const b = makeBuilding('bldg:user:1', 10, 10);
    addBuildingToWorld(world, b);
    expect(world.objects['bldg:user:1']).toBeDefined();
    expect(Object.values(world.chunks).flatMap((c) => c.objectIds)).toHaveLength(before + 1);

    removeBuildingFromWorld(world, 'bldg:user:1');
    expect(world.objects['bldg:user:1']).toBeUndefined();
    expect(Object.values(world.chunks).flatMap((c) => c.objectIds)).toHaveLength(before);
  });

  it('applyEditOverlay reproduces modifications, additions and deletions', () => {
    const config = getPresetConfig('coastal-tech-city');
    const world = generateWorld('edit-test', config);
    const target = firstBuilding(world);

    const modified = structuredClone(target);
    modified.name = 'Renamed HQ';
    modified.floors = 55;
    modified.height = 55 * 3.1;

    const overlay = {
      ...emptyOverlay(),
      modified: [modified],
      added: [makeBuilding('bldg:user:1', 20, 30)],
      deleted: [] as string[],
    };
    // Delete a different existing building.
    const ids = Object.keys(world.objects).filter((id) => id.startsWith('bldg:') && id !== target.id);
    overlay.deleted = [ids[0]!];

    const fresh = generateWorld('edit-test', config);
    applyEditOverlay(fresh, overlay);

    const t = fresh.objects[target.id];
    expect(t?.objectType === 'building' && t.building.name).toBe('Renamed HQ');
    expect(t?.objectType === 'building' && t.building.floors).toBe(55);
    expect(fresh.objects['bldg:user:1']).toBeDefined();
    expect(fresh.objects[ids[0]!]).toBeUndefined();
  });

  it('overlayIsEmpty detects empty overlays', () => {
    expect(overlayIsEmpty(emptyOverlay())).toBe(true);
    expect(overlayIsEmpty({ ...emptyOverlay(), deleted: ['x'] })).toBe(false);
  });

  it('moveFootprint translates and rotateFootprint spins around the centroid', () => {
    const b = makeBuilding('m', 0, 0);
    const moved = moveFootprint(b, 100, 50);
    expect(moved[0]).toEqual({ x: 94, y: 44 });
    expect(moved[2]).toEqual({ x: 106, y: 56 });

    const rotated = rotateFootprint(b, Math.PI / 2);
    // 90°: corner (-6,-6) -> (6,-6)
    expect(rotated[0]!.x).toBeCloseTo(6, 6);
    expect(rotated[0]!.y).toBeCloseTo(-6, 6);
    // Centroid unchanged.
    const cx = rotated.reduce((s, p) => s + p.x, 0) / 4;
    expect(cx).toBeCloseTo(0, 6);
  });
});
