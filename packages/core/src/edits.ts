import type { BuildingInfo, MapChunk, MapWorld, Vec3 } from './types';
import { chunkKey } from './types';

/**
 * User edits are stored as a compact overlay (rather than a full world
 * snapshot) so they survive regeneration of the same world and stay small
 * enough for localStorage.
 */
export type EditOverlay = {
  version: 1;
  /** Buildings whose data was changed — full snapshots keyed by id. */
  modified: BuildingInfo[];
  /** Buildings created by the user (source: 'user-defined'). */
  added: BuildingInfo[];
  /** Ids of deleted buildings. */
  deleted: string[];
};

export function emptyOverlay(): EditOverlay {
  return { version: 1, modified: [], added: [], deleted: [] };
}

export function overlayIsEmpty(o: EditOverlay): boolean {
  return o.modified.length === 0 && o.added.length === 0 && o.deleted.length === 0;
}

function chunkAt(world: MapWorld, p: Vec3): MapChunk | undefined {
  const { chunkSize, chunksX, chunksZ } = world.config;
  const cx = Math.floor((p.x + (chunksX * chunkSize) / 2) / chunkSize);
  const cz = Math.floor((p.z + (chunksZ * chunkSize) / 2) / chunkSize);
  return world.chunks[chunkKey({ cx, cz })];
}

/** Insert a building into the world (objects + chunk registration). */
export function addBuildingToWorld(world: MapWorld, building: BuildingInfo): void {
  world.objects[building.id] = { objectType: 'building', id: building.id, building };
  const chunk = chunkAt(world, building.position);
  if (chunk && !chunk.objectIds.includes(building.id)) chunk.objectIds.push(building.id);
}

/** Remove a building from the world (objects + chunk registration). */
export function removeBuildingFromWorld(world: MapWorld, id: string): void {
  const obj = world.objects[id];
  delete world.objects[id];
  if (obj?.objectType === 'building') {
    const chunk = chunkAt(world, obj.building.position);
    if (chunk) {
      const i = chunk.objectIds.indexOf(id);
      if (i >= 0) chunk.objectIds.splice(i, 1);
    }
  }
}

/** Replace a building's data in place (position may have changed chunks). */
export function replaceBuildingInWorld(world: MapWorld, building: BuildingInfo): void {
  removeBuildingFromWorld(world, building.id);
  addBuildingToWorld(world, building);
}

/** Apply a saved overlay onto a freshly generated world. */
export function applyEditOverlay(world: MapWorld, overlay: EditOverlay): void {
  for (const id of overlay.deleted) removeBuildingFromWorld(world, id);
  for (const b of overlay.modified) {
    if (world.objects[b.id] || overlay.deleted.includes(b.id)) {
      replaceBuildingInWorld(world, structuredClone(b));
    }
  }
  for (const b of overlay.added) {
    addBuildingToWorld(world, structuredClone(b));
  }
}

/** Rotate a footprint around its centroid by `radians` (returns new points). */
export function rotateFootprint(building: BuildingInfo, radians: number): BuildingInfo['footprint'] {
  const cx = building.position.x;
  const cz = building.position.z;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return building.footprint.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cz;
    return { x: cx + dx * cos - dy * sin, y: cz + dx * sin + dy * cos };
  });
}

/** Translate a footprint (and return it) so the building centers on (x, z). */
export function moveFootprint(building: BuildingInfo, x: number, z: number): BuildingInfo['footprint'] {
  const dx = x - building.position.x;
  const dz = z - building.position.z;
  return building.footprint.map((p) => ({ x: p.x + dx, y: p.y + dz }));
}
