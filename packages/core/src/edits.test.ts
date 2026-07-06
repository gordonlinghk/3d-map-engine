import { describe, expect, it } from 'vitest';
import {
  addBuildingToWorld,
  addPoiToWorld,
  applyEditOverlay,
  emptyOverlay,
  moveFootprint,
  normalizeOverlay,
  overlayIsEmpty,
  removeBuildingFromWorld,
  removePoiFromWorld,
  rotateFootprint,
} from './edits';
import { generateWorld } from './world';
import { getPresetConfig } from './presets';
import type { BuildingInfo, PoiInfo } from './types';

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

function makePoi(id: string, x: number, z: number): PoiInfo {
  return {
    id,
    name: 'Annotation',
    icon: 'flag',
    position: { x, y: 0, z },
    tags: [],
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
    expect(overlayIsEmpty({ ...emptyOverlay(), addedPois: [makePoi('poi:user:1', 0, 0)] })).toBe(false);
    expect(overlayIsEmpty({ ...emptyOverlay(), deletedPois: ['poi:user:1'] })).toBe(false);
  });

  it('add/remove POI keeps objects and chunk registration consistent', () => {
    const world = generateWorld('poi-test', getPresetConfig('coastal-tech-city'));
    const before = Object.values(world.chunks).flatMap((c) => c.objectIds).length;

    const p = makePoi('poi:user:1', 12, -8);
    addPoiToWorld(world, p);
    const obj = world.objects['poi:user:1'];
    expect(obj?.objectType === 'poi' && obj.poi.name).toBe('Annotation');
    expect(Object.values(world.chunks).flatMap((c) => c.objectIds)).toHaveLength(before + 1);

    removePoiFromWorld(world, 'poi:user:1');
    expect(world.objects['poi:user:1']).toBeUndefined();
    expect(Object.values(world.chunks).flatMap((c) => c.objectIds)).toHaveLength(before);
  });

  it('applyEditOverlay reproduces POI additions, modifications and deletions', () => {
    const config = getPresetConfig('coastal-tech-city');
    const world = generateWorld('poi-test', config);

    // A POI that already exists in the base world (added first), then modified.
    const existing = makePoi('poi:user:1', 5, 5);
    addPoiToWorld(world, existing);

    const modified = structuredClone(existing);
    modified.name = 'Renamed POI';
    modified.icon = 'danger';

    const toDelete = makePoi('poi:user:2', 40, 40);
    addPoiToWorld(world, toDelete);

    const overlay = {
      ...emptyOverlay(),
      addedPois: [makePoi('poi:user:3', -20, 30)],
      modifiedPois: [modified],
      deletedPois: ['poi:user:2'],
    };
    applyEditOverlay(world, overlay);

    const m = world.objects['poi:user:1'];
    expect(m?.objectType === 'poi' && m.poi.name).toBe('Renamed POI');
    expect(m?.objectType === 'poi' && m.poi.icon).toBe('danger');
    expect(world.objects['poi:user:3']).toBeDefined();
    expect(world.objects['poi:user:2']).toBeUndefined();
  });

  it('applyEditOverlay skips modifiedPois whose target is absent', () => {
    const world = generateWorld('poi-test', getPresetConfig('coastal-tech-city'));
    const overlay = { ...emptyOverlay(), modifiedPois: [makePoi('poi:ghost', 0, 0)] };
    applyEditOverlay(world, overlay);
    expect(world.objects['poi:ghost']).toBeUndefined();
  });

  it('normalizeOverlay migrates a v1 overlay JSON to v2 with empty POI fields', () => {
    const v1 = JSON.stringify({
      version: 1,
      modified: [],
      added: [makeBuilding('bldg:user:1', 0, 0)],
      deleted: ['bldg:gone'],
    });
    const o = normalizeOverlay(JSON.parse(v1));
    expect(o.version).toBe(2);
    expect(o.added).toHaveLength(1);
    expect(o.deleted).toEqual(['bldg:gone']);
    expect(o.addedPois).toEqual([]);
    expect(o.modifiedPois).toEqual([]);
    expect(o.deletedPois).toEqual([]);
  });

  it('normalizeOverlay preserves v2 POI fields and rejects junk', () => {
    const v2 = {
      version: 2,
      modified: [],
      added: [],
      deleted: [],
      addedPois: [makePoi('poi:user:1', 1, 2)],
      modifiedPois: [],
      deletedPois: ['poi:user:9'],
    };
    const o = normalizeOverlay(v2);
    expect(o.addedPois).toHaveLength(1);
    expect(o.deletedPois).toEqual(['poi:user:9']);

    expect(overlayIsEmpty(normalizeOverlay(null))).toBe(true);
    expect(overlayIsEmpty(normalizeOverlay({ version: 99 }))).toBe(true);
    expect(overlayIsEmpty(normalizeOverlay('garbage'))).toBe(true);
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
