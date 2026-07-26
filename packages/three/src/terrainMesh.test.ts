import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildTerrainGroup } from './terrainMesh';
import type { District, MapWorld } from '@map-engine/core';

const CHUNK_SIZE = 40;
const RESOLUTION = 4; // 5x5 vertices, spaced 10 apart, x/z in {-20,-10,0,10,20}
const WATER_LEVEL = 0;
const ABOVE_WATER_HEIGHT = 10;
const BELOW_WATER_HEIGHT = -5;

/**
 * Minimal single-chunk world: a 5x5 vertex grid centered on the origin
 * (chunkOrigin puts the chunk's corner at (-20,-20) for a single 40-unit
 * chunk). All vertices are ABOVE_WATER_HEIGHT except the dead-center vertex
 * (0,0), which is BELOW_WATER_HEIGHT — used to prove submerged ground is
 * never tinted even when it sits inside a colored district's polygon.
 */
function baseWorld(districts: District[]): MapWorld {
  const vertsPerRow = RESOLUTION + 1;
  const heights: number[] = new Array(vertsPerRow * vertsPerRow).fill(ABOVE_WATER_HEIGHT) as number[];
  const centerIdx = Math.floor(vertsPerRow / 2) * vertsPerRow + Math.floor(vertsPerRow / 2);
  heights[centerIdx] = BELOW_WATER_HEIGHT;

  return {
    id: 'w',
    seed: 's',
    config: {
      preset: 'coastal-tech-city',
      chunkSize: CHUNK_SIZE,
      chunksX: 1,
      chunksZ: 1,
      waterLevel: WATER_LEVEL,
      terrain: { maxHeight: 60, hilliness: 0.5, islandFactor: 0.5 },
      // Huge block size so no (i,j) block-grid cell ever matches a real
      // block — blocks is empty anyway, but this keeps intent explicit.
      city: { blockSize: 1000, buildingDensity: 0, maxFloors: 1 },
    },
    chunks: {
      '0,0': {
        coord: { cx: 0, cz: 0 },
        heights,
        resolution: RESOLUTION,
        objectIds: [],
      },
    },
    objects: {},
    districts,
    blocks: [],
    roadGraph: { nodes: [], edges: [] },
    landmarks: [],
  };
}

/** Square district boundary (x,z both in [-half, half]), y holds world Z. */
function squareDistrict(id: string, half: number, color?: string): District {
  return {
    id,
    name: id,
    kind: 'downtown',
    boundary: [
      { x: -half, y: -half },
      { x: half, y: -half },
      { x: half, y: half },
      { x: -half, y: half },
    ],
    center: { x: 0, y: 0 },
    ...(color ? { color } : {}),
  };
}

/** Pulls the (single chunk's) color/position buffer attributes out of the group. */
function meshBuffers(group: THREE.Group): { positions: Float32Array; colors: Float32Array } {
  const mesh = group.children[0] as THREE.Mesh;
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position').array as Float32Array;
  const colors = geometry.getAttribute('color').array as Float32Array;
  return { positions, colors };
}

/** Finds the vertex index (into the position/color buffers) at world (x, z). */
function vertexIndexAt(positions: Float32Array, x: number, z: number): number {
  const count = positions.length / 3;
  for (let idx = 0; idx < count; idx++) {
    if (positions[idx * 3] === x && positions[idx * 3 + 2] === z) return idx;
  }
  throw new Error(`no vertex at (${x}, ${z})`);
}

function colorAt(colors: Float32Array, idx: number): [number, number, number] {
  return [colors[idx * 3]!, colors[idx * 3 + 1]!, colors[idx * 3 + 2]!];
}

/**
 * Pre-change color algorithm (colorForHeight only — blockKinds is always
 * empty in these fixtures), reimplemented independently of terrainMesh.ts
 * so test (d) proves the new code path is byte-identical to the old one
 * rather than just comparing the new code against itself.
 */
function legacyColorForHeight(h: number): [number, number, number] {
  const COLOR_BEACH = new THREE.Color('#ddcfa4');
  const COLOR_CITY_GROUND = new THREE.Color('#d7d4cc');
  const COLOR_GRASS = new THREE.Color('#79a860');
  const COLOR_FOREST = new THREE.Color('#4d7a4a');
  const COLOR_ROCK = new THREE.Color('#8d8a83');
  const COLOR_SEABED = new THREE.Color('#b8ac89');
  const out = new THREE.Color();
  if (h <= WATER_LEVEL) {
    out.copy(COLOR_SEABED);
  } else {
    const t = h - WATER_LEVEL;
    if (t < 0.9) out.copy(COLOR_BEACH);
    else if (t < 14) out.copy(COLOR_CITY_GROUND);
    else if (t < 24) out.lerpColors(COLOR_CITY_GROUND, COLOR_GRASS, (t - 14) / 10);
    else if (t < 45) out.lerpColors(COLOR_GRASS, COLOR_FOREST, (t - 24) / 21);
    else out.lerpColors(COLOR_FOREST, COLOR_ROCK, Math.min((t - 45) / 30, 1));
  }
  return [out.r, out.g, out.b];
}

describe('buildTerrainGroup territory tinting', () => {
  it('tints vertices inside a colored district (above water) and leaves outside vertices untouched', () => {
    const colored = baseWorld([squareDistrict('d:1', 12, '#3355ff')]);
    const stripped = baseWorld([squareDistrict('d:1', 12)]); // same polygon, no color

    const coloredBuf = meshBuffers(buildTerrainGroup(colored));
    const strippedBuf = meshBuffers(buildTerrainGroup(stripped));

    // Inside the district (|x|,|z| <= 10 < 12) and above water: (-10,-10), (10,-10), (-10,10), (10,10), (0,-10), (-10,0), (10,0), (0,10).
    // (0,0) is below water — covered by the next test.
    const insidePoints: Array<[number, number]> = [
      [-10, -10],
      [10, -10],
      [-10, 10],
      [10, 10],
      [0, -10],
      [-10, 0],
      [10, 0],
      [0, 10],
    ];
    for (const [x, z] of insidePoints) {
      const idx = vertexIndexAt(coloredBuf.positions, x, z);
      const a = colorAt(coloredBuf.colors, idx);
      const b = colorAt(strippedBuf.colors, idx);
      expect(a, `vertex (${x},${z}) should be tinted`).not.toEqual(b);
    }

    // Outside the district (|x| or |z| === 20): must be byte-identical.
    const outsidePoints: Array<[number, number]> = [
      [-20, -20],
      [20, -20],
      [-20, 20],
      [20, 20],
      [0, -20],
      [-20, 0],
      [20, 0],
      [0, 20],
    ];
    for (const [x, z] of outsidePoints) {
      const idx = vertexIndexAt(coloredBuf.positions, x, z);
      const a = colorAt(coloredBuf.colors, idx);
      const b = colorAt(strippedBuf.colors, idx);
      expect(a, `vertex (${x},${z}) should be unaffected`).toEqual(b);
    }
  });

  it('never tints a vertex at or below water level, even inside a colored district polygon', () => {
    const colored = baseWorld([squareDistrict('d:1', 12, '#3355ff')]);
    const stripped = baseWorld([squareDistrict('d:1', 12)]);

    const coloredBuf = meshBuffers(buildTerrainGroup(colored));
    const strippedBuf = meshBuffers(buildTerrainGroup(stripped));

    // (0,0) is BELOW_WATER_HEIGHT and sits dead-center inside the district.
    const idx = vertexIndexAt(coloredBuf.positions, 0, 0);
    expect(colorAt(coloredBuf.colors, idx)).toEqual(colorAt(strippedBuf.colors, idx));
    // Sanity: it really is seabed-colored, not just "unchanged by accident".
    const actual = colorAt(coloredBuf.colors, idx);
    const expected = legacyColorForHeight(BELOW_WATER_HEIGHT);
    expect(actual[0]).toBeCloseTo(expected[0], 5);
    expect(actual[1]).toBeCloseTo(expected[1], 5);
    expect(actual[2]).toBeCloseTo(expected[2], 5);
  });

  it('resolves overlapping colored districts to the smallest-area polygon (enclave wins over empire)', () => {
    const empire = squareDistrict('d:empire', 25, '#ff0000'); // area (50*50=2500), covers whole grid
    const enclave = squareDistrict('d:enclave', 12, '#0000ff'); // area (24*24=576), smaller, nested inside

    const world = baseWorld([empire, enclave]);
    const buf = meshBuffers(buildTerrainGroup(world));

    // (10, 10) is inside both polygons (10 < 12 and 10 < 25) and above water.
    const idx = vertexIndexAt(buf.positions, 10, 10);
    const actual = colorAt(buf.colors, idx);

    const base = new THREE.Color(...legacyColorForHeight(ABOVE_WATER_HEIGHT));
    const expectedEnclaveTint = base.clone().lerp(new THREE.Color('#0000ff'), 0.45);
    const expectedEmpireTint = base.clone().lerp(new THREE.Color('#ff0000'), 0.45);

    expect(actual[0]).toBeCloseTo(expectedEnclaveTint.r, 5);
    expect(actual[1]).toBeCloseTo(expectedEnclaveTint.g, 5);
    expect(actual[2]).toBeCloseTo(expectedEnclaveTint.b, 5);

    // Make sure this isn't a coincidence: the empire's tint would look different.
    expect(Math.abs(actual[0] - expectedEmpireTint.r)).toBeGreaterThan(0.01);
  });

  it('order of overlapping districts in world.districts does not affect the smallest-area-wins outcome', () => {
    const empire = squareDistrict('d:empire', 25, '#ff0000');
    const enclave = squareDistrict('d:enclave', 12, '#0000ff');

    const worldEnclaveFirst = baseWorld([enclave, empire]);
    const worldEmpireFirst = baseWorld([empire, enclave]);

    const bufA = meshBuffers(buildTerrainGroup(worldEnclaveFirst));
    const bufB = meshBuffers(buildTerrainGroup(worldEmpireFirst));

    const idxA = vertexIndexAt(bufA.positions, 10, 10);
    const idxB = vertexIndexAt(bufB.positions, 10, 10);
    expect(colorAt(bufA.colors, idxA)).toEqual(colorAt(bufB.colors, idxB));
  });

  it('produces byte-identical output to the pre-change algorithm when no district has a color', () => {
    // A district is present (as procedural/OSM worlds always have) but carries no color.
    const world = baseWorld([squareDistrict('d:1', 12)]);
    const { positions, colors } = meshBuffers(buildTerrainGroup(world));

    const expected = new Float32Array(colors.length);
    const count = positions.length / 3;
    for (let idx = 0; idx < count; idx++) {
      const h = positions[idx * 3 + 1]!;
      const [r, g, b] = legacyColorForHeight(h);
      expected[idx * 3] = r;
      expected[idx * 3 + 1] = g;
      expected[idx * 3 + 2] = b;
    }

    expect(Array.from(colors)).toEqual(Array.from(expected));
  });

  it('produces byte-identical output whether districts is empty or contains only colorless districts', () => {
    const withColorlessDistrict = baseWorld([squareDistrict('d:1', 12)]);
    const withNoDistricts = baseWorld([]);

    const a = meshBuffers(buildTerrainGroup(withColorlessDistrict));
    const b = meshBuffers(buildTerrainGroup(withNoDistricts));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
  });
});
