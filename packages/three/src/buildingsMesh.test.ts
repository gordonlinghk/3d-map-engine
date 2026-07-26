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
    // C6: each roof is now shell + 斗栱帶 (one box = 12 triangles).
    const sizeA = makeHipRoof(4, 4).getAttribute('position').count / 3 + BOX_TRIS;
    const sizeB = makeHipRoof(4, 3).getAttribute('position').count / 3 + BOX_TRIS;
    expect(ranges[0]!.end - ranges[0]!.start).toBe(sizeA);
    expect(ranges[1]!.end - ranges[1]!.start).toBe(sizeB);
    expect(sizeA + sizeB).toBe(total);
  });

  it('sits the roof on top of its hall, eaves overhanging the walls', () => {
    const mesh = built.roofMesh!;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    // hallA is 4×4 at the origin: eaves reach ±(2 + 1.12); the 斗栱帶 juts out
    // only 0.4 of the overhang, so the eave still owns the silhouette.
    expect(box.min.x).toBeCloseTo(-3.12, 4);
    // Roof base overlaps the wall top (position.y + height - 0.35 = 5.65); the
    // bracket band hangs h_band = clamp(0.12, 0.3, 2.4 * 0.1) = 0.24 below it.
    expect(box.min.y).toBeCloseTo(5.65 - 0.24, 4);
  });
});

// --- C6 中式建築 v3: 重檐 (double eave) + 斗栱帶 (bracket band) ---------------

/** Frozen C6 parameters, restated so a silent change to them fails. */
const UPPER_ROOF_SCALE = 0.66;
const UPPER_EAVE_FRACTION = 0.62;
const BAND_WOOD = '#6b4a2f';
const COLLAR_TINT = '#8f4a3c';
/** A non-indexed box: 6 faces × 2 triangles. */
const BOX_TRIS = 12;

function bandHeight(ridge: number): number {
  return Math.min(0.3, Math.max(0.12, ridge * 0.1));
}

function tris(geo: THREE.BufferGeometry): number {
  return geo.getAttribute('position').count / 3;
}

function matches(geo: THREE.BufferGeometry, i: number, c: THREE.Color): boolean {
  const a = geo.getAttribute('color');
  return (
    Math.abs(a.getX(i) - c.r) < 1e-5 &&
    Math.abs(a.getY(i) - c.g) < 1e-5 &&
    Math.abs(a.getZ(i) - c.b) < 1e-5
  );
}

/** Vertex indices of one face range, plus a few readers over them. */
function span(
  mesh: THREE.Mesh,
  ranges: Array<{ start: number; end: number; id: string }>,
  id: string,
): {
  faces: number;
  countColor: (hex: string) => number;
  countAtY: (y: number) => number;
  maxY: number;
  maxAbsXAtY: (y: number) => number;
} {
  const r = ranges.find((x) => x.id === id)!;
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const from = r.start * 3;
  const to = r.end * 3;
  let maxY = -Infinity;
  for (let i = from; i < to; i++) maxY = Math.max(maxY, pos.getY(i));
  return {
    faces: r.end - r.start,
    countColor: (hex) => {
      const c = new THREE.Color(hex);
      let n = 0;
      for (let i = from; i < to; i++) if (matches(geo, i, c)) n++;
      return n;
    },
    countAtY: (y) => {
      let n = 0;
      for (let i = from; i < to; i++) if (Math.abs(pos.getY(i) - y) < 1e-5) n++;
      return n;
    },
    maxY,
    maxAbsXAtY: (y) => {
      let m = 0;
      for (let i = from; i < to; i++) {
        if (Math.abs(pos.getY(i) - y) < 1e-5) m = Math.max(m, Math.abs(pos.getX(i)));
      }
      return m;
    },
  };
}

describe('C6 重檐 + 斗栱帶', () => {
  // Same 6×4 plan for both halls, so triangle counts compare directly. The
  // rampart is aspect-gated out of the roof pass entirely.
  const W = 6;
  const D = 4;
  const capital: BuildingInfo = { ...chineseBuilding('city:test:cap', 0, 0, W, D), roofTiers: 2 };
  const plain = chineseBuilding('city:test:plain', 40, 0, W, D);
  const rampart = chineseBuilding('wall:test:1', 0, 40, 12, 0.8);
  const built = buildBuildingsGroup(worldWith([capital, plain, rampart]));
  const mesh = built.roofMesh!;
  const ranges = mesh.userData.faceRanges as Array<{ start: number; end: number; id: string }>;

  // Geometry the renderer derives, recomputed here from the frozen formulas.
  const baseY = 2 + 4 - 0.35; // position.y + height - 0.35
  const lowerShell = makeHipRoof(W, D);
  const lowerRidge = Math.max(1.2, Math.min(W, D) * 0.6);
  const upperW = W * UPPER_ROOF_SCALE;
  const upperD = D * UPPER_ROOF_SCALE;
  const upperShell = makeHipRoof(upperW, upperD);
  const upperY = baseY + lowerRidge * UPPER_EAVE_FRACTION;
  const upperRidge = Math.max(1.2, Math.min(upperW, upperD) * 0.6);
  const upperEaveHalfW = upperW / 2 + Math.max(0.4, Math.min(upperW, upperD) * 0.28);

  const cap = span(mesh, ranges, 'city:test:cap');
  const one = span(mesh, ranges, 'city:test:plain');

  it('keeps face ranges contiguous, non-overlapping and total-covering', () => {
    expect(ranges.map((r) => r.id)).toEqual(['city:test:cap', 'city:test:plain']);
    let cursor = 0;
    for (const r of ranges) {
      expect(r.start).toBe(cursor);
      expect(r.end).toBeGreaterThan(r.start);
      cursor = r.end;
    }
    expect(cursor).toBe(tris(mesh.geometry));
  });

  it('gives a 斗栱帶 to every roof, doubling nothing else on a single eave', () => {
    // C5 shipped the bare shell; C6 adds exactly one band box on a tier-1 hall.
    const bare = tris(lowerShell);
    expect(one.faces).toBe(bare + BOX_TRIS);
    expect(one.faces).toBeGreaterThan(bare);
  });

  it('stacks a second eave on a roofTiers-2 hall (shell + band + collar)', () => {
    // lower shell + lower band + collar + upper shell + upper band.
    expect(cap.faces).toBe(tris(lowerShell) + tris(upperShell) + 3 * BOX_TRIS);
    expect(cap.faces).toBeGreaterThan(one.faces * 1.8);
  });

  it('colours bands wood and slopes with a roof tint', () => {
    const wood = new THREE.Color(BAND_WOOD);
    const collar = new THREE.Color(COLLAR_TINT);
    // One band box on the single eave, two on the double eave (36 verts each).
    expect(one.countColor(BAND_WOOD)).toBe(BOX_TRIS * 3);
    expect(cap.countColor(BAND_WOOD)).toBe(2 * BOX_TRIS * 3);
    expect(cap.countColor(COLLAR_TINT)).toBe(BOX_TRIS * 3);
    // Every remaining vertex is a slope vertex, and none of them is wood.
    const geo = mesh.geometry;
    const r = ranges[0]!;
    let slopes = 0;
    for (let i = r.start * 3; i < r.end * 3; i++) {
      if (matches(geo, i, wood) || matches(geo, i, collar)) continue;
      slopes++;
    }
    expect(slopes).toBe((tris(lowerShell) + tris(upperShell)) * 3);
    // The slope tint is a ROOF_TINT, shared by both tiers of the same hall.
    const first = new THREE.Color(
      geo.getAttribute('color').getX(r.start * 3),
      geo.getAttribute('color').getY(r.start * 3),
      geo.getAttribute('color').getZ(r.start * 3),
    );
    expect(['39414d', '333b47', '414a57', '2f3742', '454d58']).toContain(first.getHexString());
    expect(matches(geo, r.start * 3, wood)).toBe(false);
    // The upper shell's first vertex (after lower shell + band + collar) too.
    const upperStart = (r.start + tris(lowerShell) + 2 * BOX_TRIS) * 3;
    expect(matches(geo, upperStart, first)).toBe(true);
  });

  it('puts a second eave plane above lowerBase + rH·F only for roofTiers 2', () => {
    // The upper eave rectangle sits exactly on that plane, and the collar top
    // and upper band top land on it too — so the plane is densely populated.
    expect(cap.countAtY(upperY)).toBeGreaterThan(0);
    expect(cap.maxAbsXAtY(upperY)).toBeCloseTo(upperEaveHalfW, 4);
    // A tier-1 hall has nothing there, and never climbs past its own ridge.
    expect(one.countAtY(upperY)).toBe(0);
    expect(one.maxY).toBeCloseTo(baseY + lowerRidge, 5);
    expect(cap.maxY).toBeCloseTo(upperY + upperRidge, 5);
    expect(cap.maxY).toBeGreaterThan(one.maxY);
    // The upper roof fully covers the lower one's peak — no ridge pokes through.
    expect(upperY + upperRidge).toBeGreaterThan(baseY + lowerRidge);
  });

  it('hangs each band just under its own eave, inside the eave line', () => {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const wood = new THREE.Color(BAND_WOOD);
    const r = ranges[0]!;
    const ys: number[] = [];
    let maxAbsX = 0;
    for (let i = r.start * 3; i < r.end * 3; i++) {
      if (!matches(geo, i, wood)) continue;
      ys.push(pos.getY(i));
      maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
    }
    const lowerBand = bandHeight(lowerRidge);
    const upperBand = bandHeight(upperRidge);
    expect(Math.min(...ys)).toBeCloseTo(baseY - lowerBand, 5);
    expect(Math.max(...ys)).toBeCloseTo(upperY, 5);
    // Widest band vertex = lower band = W/2 + overhang·0.4, well inside the eave.
    const lowerOverhang = Math.max(0.4, Math.min(W, D) * 0.28);
    expect(maxAbsX).toBeCloseTo(W / 2 + lowerOverhang * 0.4, 5);
    expect(maxAbsX).toBeLessThan(W / 2 + lowerOverhang);
    // Both bands are shallow shadow lines, not storeys.
    expect(lowerBand).toBeLessThanOrEqual(0.3);
    expect(upperBand).toBeGreaterThanOrEqual(0.12);
  });

  it('leaves non-chinese buildings out of the roof pass entirely', () => {
    // A modern polygon building (non-rect footprint keeps it off the instanced
    // path, which needs a canvas) — roofTiers is meaningless without 'chinese'.
    const modern: BuildingInfo = {
      ...chineseBuilding('poly:test:m', 80, 0, 6, 4),
      style: undefined,
      type: 'company',
      roofTiers: 2,
      footprint: [...rect(80, 0, 6, 4), { x: 83, y: 3 }],
    };
    const only = buildBuildingsGroup(worldWith([modern]));
    expect(only.roofMesh).toBeNull();
    expect(only.polyMesh).toBeTruthy();
  });
});
