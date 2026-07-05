import type { MapWorld } from '@map-engine/core';

/**
 * Walk-mode collision: 2D axis-aligned boxes (building footprints + solid
 * landmark bases) in a uniform spatial hash. Movement resolves per axis,
 * which gives natural wall sliding.
 */

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number };

export type ColliderIndex = {
  /** Resolve a move from (fromX, fromZ) to (toX, toZ) for a circle of `radius`. */
  resolveMovement(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
    radius: number,
  ): { x: number; z: number };
  readonly size: number;
};

const CELL = 48;

function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function createColliderIndex(world: MapWorld): ColliderIndex {
  const cells = new Map<string, Collider[]>();
  let count = 0;

  const add = (c: Collider): void => {
    count += 1;
    const x0 = Math.floor(c.minX / CELL);
    const x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL);
    const z1 = Math.floor(c.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = cellKey(cx, cz);
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(c);
      }
    }
  };

  for (const obj of Object.values(world.objects)) {
    if (obj.objectType === 'building') {
      // AABB over the whole footprint (handles arbitrary polygons).
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of obj.building.footprint) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.y);
        maxZ = Math.max(maxZ, p.y);
      }
      add({ minX, maxX, minZ, maxZ });
    }
  }
  // Solid landmark bases (bridges stay walkable-under; parks are open).
  for (const lm of world.landmarks) {
    if (lm.kind === 'bridge' || lm.kind === 'park') continue;
    const half = lm.kind === 'stadium' ? 32 : lm.kind === 'island' ? 18 : 10;
    add({
      minX: lm.position.x - half,
      maxX: lm.position.x + half,
      minZ: lm.position.z - half,
      maxZ: lm.position.z + half,
    });
  }

  const near = (x: number, z: number): Collider[] => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const out: Collider[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = cells.get(cellKey(cx + dx, cz + dz));
        if (list) out.push(...list);
      }
    }
    return out;
  };

  const overlaps = (c: Collider, x: number, z: number, r: number): boolean =>
    x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r;

  return {
    get size() {
      return count;
    },

    resolveMovement(fromX, fromZ, toX, toZ, radius) {
      // X axis first.
      let x = toX;
      for (const c of near(x, fromZ)) {
        if (!overlaps(c, x, fromZ, radius)) continue;
        x = toX > fromX ? c.minX - radius : c.maxX + radius;
        // If we were already overlapping (spawned inside), keep the original x.
        if (overlaps(c, x, fromZ, radius - 1e-6)) x = fromX;
      }
      // Then Z with the corrected X.
      let z = toZ;
      for (const c of near(x, z)) {
        if (!overlaps(c, x, z, radius)) continue;
        z = toZ > fromZ ? c.minZ - radius : c.maxZ + radius;
        if (overlaps(c, x, z, radius - 1e-6)) z = fromZ;
      }
      return { x, z };
    },
  };
}
