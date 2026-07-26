import * as THREE from 'three';
import { chunkOrigin, chunkKey } from '@map-engine/core';
import type { CityBlockKind, District, MapWorld, MapChunk } from '@map-engine/core';

/** Low-poly terrain palette, from beach up to rocky peaks. */
const COLOR_BEACH = new THREE.Color('#ddcfa4');
const COLOR_CITY_GROUND = new THREE.Color('#d7d4cc');
const COLOR_GRASS = new THREE.Color('#79a860');
const COLOR_FOREST = new THREE.Color('#4d7a4a');
const COLOR_ROCK = new THREE.Color('#8d8a83');
const COLOR_SEABED = new THREE.Color('#b8ac89');

/** Ground tint per city-block kind — makes the zoning readable from above. */
const BLOCK_COLORS: Record<CityBlockKind, THREE.Color> = {
  downtown: new THREE.Color('#e2e0da'),
  commercial: new THREE.Color('#d7d4cc'),
  residential: new THREE.Color('#ddd5c6'),
  waterfront: new THREE.Color('#d3cab4'),
  park: new THREE.Color('#83b264'),
};

function colorForHeight(h: number, waterLevel: number, _maxHeight: number, out: THREE.Color): void {
  if (h <= waterLevel) {
    out.copy(COLOR_SEABED);
    return;
  }
  // Absolute height bands (world units above sea level) so the flat downtown
  // preset gets city-gray ground and only real hills turn green.
  const t = h - waterLevel;
  if (t < 0.9) out.copy(COLOR_BEACH);
  else if (t < 14) out.copy(COLOR_CITY_GROUND);
  else if (t < 24) out.lerpColors(COLOR_CITY_GROUND, COLOR_GRASS, (t - 14) / 10);
  else if (t < 45) out.lerpColors(COLOR_GRASS, COLOR_FOREST, (t - 24) / 21);
  else out.lerpColors(COLOR_FOREST, COLOR_ROCK, Math.min((t - 45) / 30, 1));
}

/** Fraction the district color is blended into the base ground color. */
const TERRITORY_TINT_STRENGTH = 0.45;

/** Precomputed per-district data needed to test/tint a vertex, smallest-area first. */
type Territory = {
  color: THREE.Color;
  boundary: District['boundary'];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** Shoelace formula; magnitude only (winding order doesn't matter here). */
function polygonArea(polygon: District['boundary']): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function pointInPolygon(x: number, z: number, polygon: District['boundary']): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > z !== b.y > z && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Colored districts (territory tints), smallest boundary area first so
 * overlapping enclaves (e.g. a small holdout city inside a larger empire's
 * polygon) win over the larger polygon that encloses them.
 */
function buildTerritories(world: MapWorld): Territory[] {
  const territories: Territory[] = [];
  for (const district of world.districts) {
    if (!district.color) continue;
    const boundary = district.boundary;
    if (boundary.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of boundary) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minZ) minZ = p.y;
      if (p.y > maxZ) maxZ = p.y;
    }
    territories.push({
      color: new THREE.Color(district.color),
      boundary,
      minX,
      maxX,
      minZ,
      maxZ,
    });
  }
  territories.sort((a, b) => polygonArea(a.boundary) - polygonArea(b.boundary));
  return territories;
}

/** Blend `color` toward the smallest containing colored district's tint, if any. */
function applyTerritoryTint(
  color: THREE.Color,
  x: number,
  z: number,
  h: number,
  waterLevel: number,
  territories: Territory[],
): void {
  if (h <= waterLevel) return;
  for (const territory of territories) {
    if (x < territory.minX || x > territory.maxX || z < territory.minZ || z > territory.maxZ) continue;
    if (!pointInPolygon(x, z, territory.boundary)) continue;
    color.lerp(territory.color, TERRITORY_TINT_STRENGTH);
    return;
  }
}

function buildChunkGeometry(
  world: MapWorld,
  chunk: MapChunk,
  blockKinds: Map<string, CityBlockKind>,
  territories: Territory[],
): THREE.BufferGeometry {
  const res = chunk.resolution;
  const origin = chunkOrigin(world.config, chunk.coord);
  const step = world.config.chunkSize / res;
  const vertsPerRow = res + 1;
  const spacing = world.config.city.blockSize;

  const positions = new Float32Array(vertsPerRow * vertsPerRow * 3);
  const colors = new Float32Array(vertsPerRow * vertsPerRow * 3);
  const color = new THREE.Color();

  for (let j = 0; j < vertsPerRow; j++) {
    for (let i = 0; i < vertsPerRow; i++) {
      const idx = j * vertsPerRow + i;
      const h = chunk.heights[idx]!;
      const x = origin.x + i * step;
      const z = origin.z + j * step;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = h;
      positions[idx * 3 + 2] = z;

      const kind =
        h > world.config.waterLevel
          ? blockKinds.get(`${Math.floor(x / spacing)},${Math.floor(z / spacing)}`)
          : undefined;
      if (kind) color.copy(BLOCK_COLORS[kind]);
      else colorForHeight(h, world.config.waterLevel, world.config.terrain.maxHeight, color);

      if (territories.length > 0) {
        applyTerritoryTint(color, x, z, h, world.config.waterLevel, territories);
      }

      colors[idx * 3] = color.r;
      colors[idx * 3 + 1] = color.g;
      colors[idx * 3 + 2] = color.b;
    }
  }

  const indices = new Uint32Array(res * res * 6);
  let k = 0;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const a = j * vertsPerRow + i;
      const b = a + 1;
      const c = a + vertsPerRow;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildTerrainGroup(world: MapWorld): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain';
  const blockKinds = new Map(world.blocks.map((b) => [`${b.i},${b.j}`, b.kind]));
  const territories = buildTerritories(world);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const chunk of Object.values(world.chunks)) {
    const mesh = new THREE.Mesh(buildChunkGeometry(world, chunk, blockKinds, territories), material);
    mesh.name = `terrain:${chunkKey(chunk.coord)}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
