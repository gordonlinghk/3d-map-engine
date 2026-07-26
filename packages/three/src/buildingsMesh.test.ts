import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildBuildingsGroup, makeHipRoof } from './buildingsMesh';
import type { BuildingInfo, MapObject, MapWorld, Vec2 } from '@map-engine/core';

/**
 * C5 — 中式建築 v2(翹角飛簷).
 *
 * `makeHipRoof` went from 6 flat triangles to a tessellated curved shell. These
 * tests pin the frozen parts of the geometry contract (eave rectangle, ridge
 * height, non-indexed triangle soup) and prove the two new shape functions:
 * 凹曲 (the slope sags below the ridge→eave chord) and 翹角 (the eave corners
 * flick up above the eave-edge midpoints) — plus that the merged roof mesh's
 * picking ranges still track the real per-roof triangle counts.
 */

/** The frozen sizing formulas, restated here so a silent change to them fails. */
function expected(w: number, d: number): {
  overhang: number;
  ridgeY: number;
  cornerLift: number;
  hw: number;
  hd: number;
} {
  const lo = Math.min(w, d);
  const overhang = Math.max(0.4, lo * 0.28);
  return {
    overhang,
    ridgeY: Math.max(1.2, lo * 0.6),
    cornerLift: Math.max(0.25, lo * 0.18),
    hw: w / 2 + overhang,
    hd: d / 2 + overhang,
  };
}

type Vertex = { x: number; y: number; z: number; t: number };

/**
 * Reads the vertices out of a roof geometry, tagging each with its ridge→eave
 * parameter t. For a hip roof the surface height is governed by the Chebyshev
 * inset from the eave rectangle, so t is recoverable from XZ alone:
 * t = max(|across|, |along| − ridgeHalf) / shortHalf.
 */
function vertices(geo: THREE.BufferGeometry, w: number, d: number): Vertex[] {
  const { hw, hd } = expected(w, d);
  const flipped = hd > hw;
  const aHalf = Math.max(hw, hd);
  const bHalf = Math.min(hw, hd);
  const ridgeHalf = aHalf - bHalf;
  const p = geo.getAttribute('position');
  const out: Vertex[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = flipped ? z : x;
    const b = flipped ? x : z;
    const t = Math.max(Math.abs(b), Math.abs(a) - ridgeHalf) / bHalf;
    out.push({ x, y, z, t });
  }
  return out;
}

const EPS = 1e-3;

for (const { label, w, d } of [
  { label: 'rectangular 4×3 (ridge along X)', w: 4, d: 3 },
  { label: 'rectangular 3×4 (ridge along Z)', w: 3, d: 4 },
  { label: 'square 3×3 (pyramid degenerate)', w: 3, d: 3 },
]) {
  describe(`makeHipRoof — ${label}`, () => {
    const geo = makeHipRoof(w, d);
    const { overhang, ridgeY, cornerLift, hw, hd } = expected(w, d);
    const verts = vertices(geo, w, d);

    it('is a non-indexed triangle soup with a low-poly budget', () => {
      expect(geo.index).toBeNull();
      const position = geo.getAttribute('position');
      // 3 floats per vertex, 3 vertices per triangle.
      expect((position.array as ArrayLike<number>).length % 9).toBe(0);
      expect(position.count % 3).toBe(0);
      const triangles = position.count / 3;
      // Enough to read as a curve, few enough to stay low-poly (≈51 roofs/world).
      expect(triangles).toBeGreaterThan(48);
      expect(triangles).toBeLessThanOrEqual(600);
      expect(geo.getAttribute('normal')).toBeTruthy(); // computeVertexNormals()
    });

    it('keeps the frozen eave rectangle and ridge height', () => {
      geo.computeBoundingBox();
      const box = geo.boundingBox!;
      expect(box.max.x - box.min.x).toBeCloseTo(w + 2 * overhang, 4);
      expect(box.max.z - box.min.z).toBeCloseTo(d + 2 * overhang, 4);
      expect(box.max.x).toBeCloseTo(hw, 4);
      expect(box.max.z).toBeCloseTo(hd, 4);
      // The upturned corners must never out-climb the ridge, so the roof's
      // highest point is still exactly the ridge.
      expect(cornerLift).toBeLessThan(ridgeY);
      expect(box.max.y).toBeCloseTo(ridgeY, 5);
      expect(box.min.y).toBeCloseTo(0, 5);
      // Centred on the origin.
      expect(box.min.x).toBeCloseTo(-hw, 4);
      expect(box.min.z).toBeCloseTo(-hd, 4);
    });

    it('lifts the four eave corners above the eave-edge midpoints (翹角)', () => {
      const corners = verts.filter(
        (v) => Math.abs(Math.abs(v.x) - hw) < EPS && Math.abs(Math.abs(v.z) - hd) < EPS,
      );
      // All four corners present, all lifted by exactly cornerLift.
      const signatures = new Set(corners.map((v) => `${Math.sign(v.x)},${Math.sign(v.z)}`));
      expect(signatures.size).toBe(4);
      for (const c of corners) expect(c.y).toBeCloseTo(cornerLift, 4);

      // Mid-edge eave vertices sit on the base plane, so the tips are visibly
      // higher than the middle of every eave edge.
      const eaveLongEdge = verts.filter((v) => Math.abs(Math.abs(v.z) - hd) < EPS);
      const eaveShortEdge = verts.filter((v) => Math.abs(Math.abs(v.x) - hw) < EPS);
      const midLong = eaveLongEdge.reduce((m, v) => (Math.abs(v.x) < Math.abs(m.x) ? v : m));
      const midShort = eaveShortEdge.reduce((m, v) => (Math.abs(v.z) < Math.abs(m.z) ? v : m));
      expect(midLong.y).toBeCloseTo(0, 5);
      expect(midShort.y).toBeCloseTo(0, 5);
      expect(midLong.y).toBeLessThan(corners[0]!.y);
      expect(midShort.y).toBeLessThan(corners[0]!.y);
      expect(corners[0]!.y - midLong.y).toBeGreaterThan(0.2); // reads at map zoom
    });

    it('sags below the straight ridge→eave chord at mid-slope (凹曲)', () => {
      const midSlope = verts.filter((v) => Math.abs(v.t - 0.5) < EPS);
      expect(midSlope.length).toBeGreaterThan(0);
      const chord = ridgeY * 0.5; // straight ridge (rH at t=0) → eave (0 at t=1)
      for (const v of midSlope) {
        expect(v.y).toBeLessThan(chord);
        // (1-t)^1.6 at t=0.5 — the 舉折 profile, well clear of the chord.
        expect(v.y).toBeCloseTo(ridgeY * Math.pow(0.5, 1.6), 4);
      }
      expect(midSlope[0]!.y).toBeLessThan(chord * 0.8);

      // The whole slope is monotonic ridge→eave and never pokes above the ridge.
      for (const v of verts) {
        expect(v.y).toBeLessThanOrEqual(ridgeY + 1e-5);
        expect(v.y).toBeGreaterThanOrEqual(-1e-5);
      }
    });
  });
}

// --- merged roof mesh (picking ranges) --------------------------------------

function rect(cx: number, cz: number, w: number, d: number): Vec2[] {
  return [
    { x: cx - w / 2, y: cz - d / 2 },
    { x: cx + w / 2, y: cz - d / 2 },
    { x: cx + w / 2, y: cz + d / 2 },
    { x: cx - w / 2, y: cz + d / 2 },
  ];
}

function chineseBuilding(id: string, cx: number, cz: number, w: number, d: number): BuildingInfo {
  return {
    id,
    name: id,
    type: 'landmark',
    style: 'chinese',
    description: id,
    districtId: 'd:hist',
    position: { x: cx, y: 2, z: cz },
    footprint: rect(cx, cz, w, d),
    height: 4,
    floors: 4,
    tags: [],
    source: 'imported',
  };
}

function worldWith(buildings: BuildingInfo[]): MapWorld {
  const objects: Record<string, MapObject> = {};
  for (const b of buildings) objects[b.id] = { objectType: 'building', id: b.id, building: b };
  return {
    id: 'w',
    seed: 's',
    config: {
      preset: 'coastal-tech-city',
      chunkSize: 40,
      chunksX: 1,
      chunksZ: 1,
      waterLevel: 0,
      terrain: { maxHeight: 60, hilliness: 0.5, islandFactor: 0.5 },
      city: { blockSize: 1000, buildingDensity: 0, maxFloors: 1 },
    },
    chunks: {},
    objects,
    districts: [],
    blocks: [],
    roadGraph: { nodes: [], edges: [] },
    landmarks: [],
  };
}

describe('buildChineseRoofs (via buildBuildingsGroup)', () => {
  // Two compact halls get roofs; the long thin rampart (aspect ≥ 2.5) does not.
  const hallA = chineseBuilding('city:test:a', 0, 0, 4, 4);
  const hallB = chineseBuilding('city:test:b', 30, 0, 4, 3);
  const rampart = chineseBuilding('wall:test:1', 0, 30, 12, 0.8);
  const built = buildBuildingsGroup(worldWith([hallA, hallB, rampart]));

  it('emits one contiguous face range per roof-eligible building', () => {
    const mesh = built.roofMesh!;
    expect(mesh).toBeTruthy();
    expect(mesh.name).toBe('buildings:roofs');
    const ranges = mesh.userData.faceRanges as Array<{ start: number; end: number; id: string }>;
    expect(ranges.map((r) => r.id)).toEqual(['city:test:a', 'city:test:b']);

    const total = mesh.geometry.getAttribute('position').count / 3;
    expect(Number.isInteger(total)).toBe(true);
    let cursor = 0;
    for (const r of ranges) {
      expect(r.start).toBe(cursor); // contiguous + non-overlapping
      expect(r.end).toBeGreaterThan(r.start);
      cursor = r.end;
    }
    expect(cursor).toBe(total); // ranges cover every triangle exactly once

    // The ranges must come from the real geometry, not a hardcoded face count.
    const sizeA = makeHipRoof(4, 4).getAttribute('position').count / 3;
    const sizeB = makeHipRoof(4, 3).getAttribute('position').count / 3;
    expect(ranges[0]!.end - ranges[0]!.start).toBe(sizeA);
    expect(ranges[1]!.end - ranges[1]!.start).toBe(sizeB);
    expect(sizeA + sizeB).toBe(total);
  });

  it('sits the roof on top of its hall, eaves overhanging the walls', () => {
    const mesh = built.roofMesh!;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    // hallA is 4×4 at the origin: eaves reach ±(2 + 1.12).
    expect(box.min.x).toBeCloseTo(-3.12, 4);
    // Roof base overlaps the wall top (position.y + height - 0.35 = 5.65).
    expect(box.min.y).toBeCloseTo(5.65, 4);
  });
});
