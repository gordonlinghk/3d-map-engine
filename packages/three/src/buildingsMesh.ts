import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingInfo, MapWorld, Vec2 } from '@map-engine/core';

/**
 * Buildings render as instanced boxes in four height classes; each class
 * shares a procedural facade texture whose window-grid density matches the
 * class, so windows never look absurdly stretched.
 */

type HeightClass = { name: string; minFloors: number; texFloors: number; texCols: number };

const CLASSES: HeightClass[] = [
  { name: 'low', minFloors: 0, texFloors: 3, texCols: 5 },
  { name: 'mid', minFloors: 5, texFloors: 8, texCols: 6 },
  { name: 'high', minFloors: 11, texFloors: 18, texCols: 8 },
  { name: 'tower', minFloors: 25, texFloors: 40, texCols: 10 },
];

const FACADE_TINTS = ['#f2efe9', '#e8e4da', '#dcd8ce', '#cfd4d8', '#e9e2d2', '#c8d2dc'];
const TOWER_TINTS = ['#b7c6d6', '#a9bccf', '#cdd6de', '#9fb3c8'];

export function makeFacadeTexture(
  floors: number,
  cols: number,
  options: { night: boolean },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = options.night ? '#0e1117' : '#ffffff';
  ctx.fillRect(0, 0, 64, 128);

  const cellW = 64 / cols;
  const cellH = 128 / floors;
  const winW = cellW * 0.52;
  const winH = cellH * 0.55;
  // Deterministic pseudo-random window lighting for the night texture.
  let s = 12345;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (options.night) {
        const lit = rand() < 0.6;
        ctx.fillStyle = lit ? (rand() < 0.25 ? '#ffc45e' : '#ffe9b0') : '#151a22';
      } else {
        ctx.fillStyle = 'rgba(45, 58, 74, 0.85)';
      }
      ctx.fillRect(c * cellW + (cellW - winW) / 2, f * cellH + (cellH - winH) / 2, winW, winH);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function classFor(b: BuildingInfo): number {
  for (let i = CLASSES.length - 1; i >= 0; i--) {
    if (b.floors >= CLASSES[i]!.minFloors) return i;
  }
  return 0;
}

export type BuildingsBuildResult = {
  group: THREE.Group;
  /** instanced mesh -> building ids by instanceId (for picking). */
  instanceIndex: Map<THREE.InstancedMesh, string[]>;
  /** Merged extruded mesh for polygon footprints (OSM); picking via faceRanges. */
  polyMesh: THREE.Mesh | null;
  /** Merged hip-roof mesh for chinese buildings; picking via faceRanges. */
  roofMesh: THREE.Mesh | null;
  setNightMode: (night: boolean) => void;
};

export type FaceRange = { start: number; end: number; id: string };

/** Procedural buildings have axis-aligned rectangular footprints. */
function isAxisAlignedRect(fp: Vec2[]): boolean {
  if (fp.length !== 4) return false;
  const [a, b, c, d] = fp as [Vec2, Vec2, Vec2, Vec2];
  return (
    (a.y === b.y && b.x === c.x && c.y === d.y && d.x === a.x) ||
    (a.x === b.x && b.y === c.y && c.x === d.x && d.y === a.y)
  );
}

const POLY_TINTS: Record<string, string[]> = {
  company: ['#cfd4da', '#c2cad4', '#dadee3', '#b8c4d0', '#d6d2c8'],
  residential: ['#e0d6c4', '#d9cbb4', '#e6dfd0', '#d3c6ae'],
  public: ['#d8d0bd', '#cec8b8'],
  transport: ['#c4c8ce', '#b9bec6'],
  landmark: ['#d6d2c8'],
};

// Chinese-style walls: warm timber-red halls (type 'landmark') over rammed-earth
// / grey-stone ramparts (type 'residential', used by historical city walls).
const CHINESE_WALL_TINTS: Record<string, string[]> = {
  landmark: ['#8f4a3c', '#9c5140', '#86423a', '#a25a45'],
  residential: ['#b39a72', '#a98f66', '#9c8f79', '#b0a081'],
};
const CHINESE_WALL_DEFAULT = ['#a98f66'];

// Roof tiles: period grey/blue-grey glazed tile with a little variation.
const ROOF_TINTS = ['#39414d', '#333b47', '#414a57', '#2f3742', '#454d58'];

function polyTintFor(b: BuildingInfo, idx: number): string {
  const palette =
    b.style === 'chinese'
      ? (CHINESE_WALL_TINTS[b.type] ?? CHINESE_WALL_DEFAULT)
      : (POLY_TINTS[b.type] ?? POLY_TINTS.company!);
  return palette[(b.floors * 5 + idx) % palette.length]!;
}

/** Compact chinese buildings (halls) get a hip roof; long thin ones (walls) don't. */
function isRoofEligible(b: BuildingInfo): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of b.footprint) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const d = maxY - minY;
  const lo = Math.min(w, d);
  return lo > 1e-3 && Math.max(w, d) / lo < 2.5;
}

/** One merged extruded geometry for all polygon-footprint buildings. */
function buildPolygonBuildings(buildings: BuildingInfo[]): {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
} | null {
  if (buildings.length === 0) return null;
  const geometries: THREE.BufferGeometry[] = [];
  const ranges: FaceRange[] = [];
  const color = new THREE.Color();
  let faceOffset = 0;

  buildings.forEach((b, idx) => {
    const shape = new THREE.Shape(b.footprint.map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); // extrusion depth becomes +Y, shape y becomes -Z
    geo.translate(0, b.position.y - 0.3, 0);
    geo.deleteAttribute('uv');

    color.set(polyTintFor(b, idx));
    const count = geo.attributes.position!.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const faces = count / 3; // ExtrudeGeometry is non-indexed
    ranges.push({ start: faceOffset, end: faceOffset + faces, id: b.id });
    faceOffset += faces;
    geometries.push(geo);
  });

  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) return null;
  merged.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'buildings:poly';
  mesh.castShadow = true;
  mesh.userData.faceRanges = ranges;
  return { mesh, material };
}

/** Exponent of the 凹曲 sweep: >1 leaves the ridge steeply, lands flat at the eave. */
const ROOF_SLOPE_POWER = 1.6;
/** Fraction of each eave edge that feels the 翹角 upturn, measured from a corner. */
const ROOF_CORNER_ZONE = 0.3;
/** Ridge→eave parameter below which the upturn is fully faded out. */
const ROOF_UPTURN_START = 0.6;
/** Grid rows from ridge to eave on every slope patch (kept low-poly on purpose). */
const ROOF_SLOPE_SEGMENTS = 6;

/** Hermite fade, clamped outside [edge0, edge1]. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * A hipped roof (廡殿/攢尖-ish) sized to a w×d base, base plane at y=0 centred
 * on the origin, rising to a ridge. Eaves overhang the walls; the ridge runs
 * along the longer base axis (a pyramid when square). DoubleSide material is
 * used downstream so triangle winding is irrelevant.
 *
 * The four slopes are curved surfaces, not planes: each is tessellated on a
 * (t, u) grid — t sweeps ridge (0) → eave (1), u runs along the patch — and two
 * shape functions give the 飛簷 silhouette.
 *
 *  - 凹曲 (concave sweep): y = rH·(1−t)^1.6, the 舉折 profile. At mid-slope that
 *    is ≈0.33·rH, visibly below the 0.5·rH straight ridge→eave chord.
 *  - 翹角 (upturned corners): eave corners lift by `cornerLift`, faded by the
 *    product of the two per-eave-edge corner factors (so edge midpoints stay
 *    flat at y=0) and by a ridge fade that is zero for t ≤ 0.6.
 *
 * Only Y is displaced, so the eave rectangle stays exactly
 * (w/2+overhang) × (d/2+overhang) and the peak stays exactly rH — the corner
 * lift is at most 0.3·rH, so the ridge remains the highest point.
 */
export function makeHipRoof(w: number, d: number): THREE.BufferGeometry {
  const overhang = Math.max(0.4, Math.min(w, d) * 0.28);
  const rH = Math.max(1.2, Math.min(w, d) * 0.6);
  const hw = w / 2 + overhang;
  const hd = d / 2 + overhang;
  const cornerLift = Math.max(0.25, Math.min(w, d) * 0.18);

  // Build in a local frame whose `a` axis is the ridge axis and `b` axis runs
  // across it, then map back to world XZ. Halves the case analysis: the same
  // four patches serve w≥d, d>w and the square (pyramid) degenerate.
  const flipped = hd > hw;
  const aHalf = flipped ? hd : hw; // half-extent along the ridge
  const bHalf = flipped ? hw : hd; // half-extent across the ridge
  const ridgeHalf = aHalf - bHalf; // half ridge length; 0 ⇒ pyramid

  const pos: number[] = [];
  type P = [number, number, number];

  /** Local (a, b) at slope parameter t → world vertex, with both shape functions. */
  const vert = (a: number, b: number, t: number): P => {
    const nearA = smoothstep(0, 1, 1 - (aHalf - Math.abs(a)) / (ROOF_CORNER_ZONE * 2 * aHalf));
    const nearB = smoothstep(0, 1, 1 - (bHalf - Math.abs(b)) / (ROOF_CORNER_ZONE * 2 * bHalf));
    const upturn = cornerLift * nearA * nearB * smoothstep(ROOF_UPTURN_START, 1, t);
    const y = rH * Math.pow(1 - t, ROOF_SLOPE_POWER) + upturn;
    return flipped ? [b, y, a] : [a, y, b];
  };

  const same = (p: P, q: P): boolean =>
    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 < 1e-12;
  const tri = (p: P, q: P, r: P): void => {
    // The row at a pyramid apex / hip-end tip collapses to a point; drop the
    // zero-area triangles it would otherwise contribute.
    if (same(p, q) || same(q, r) || same(r, p)) return;
    pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
  };

  /** Tessellate one slope patch; `at(t, u)` returns its local (a, b). */
  const patch = (uSegments: number, at: (t: number, u: number) => [number, number]): void => {
    const rows: P[][] = [];
    for (let i = 0; i <= ROOF_SLOPE_SEGMENTS; i++) {
      const t = i / ROOF_SLOPE_SEGMENTS;
      const row: P[] = [];
      for (let j = 0; j <= uSegments; j++) {
        const [a, b] = at(t, j / uSegments);
        row.push(vert(a, b, t));
      }
      rows.push(row);
    }
    for (let i = 0; i < ROOF_SLOPE_SEGMENTS; i++) {
      const near = rows[i]!;
      const far = rows[i + 1]!;
      for (let j = 0; j < uSegments; j++) {
        tri(near[j]!, far[j]!, far[j + 1]!);
        tri(near[j]!, far[j + 1]!, near[j + 1]!);
      }
    }
  };

  // Segments across a patch, proportional to its eave edge so quads stay square.
  const uSegs = (halfEdge: number): number =>
    Math.max(4, Math.min(12, Math.round((ROOF_SLOPE_SEGMENTS * halfEdge) / bHalf)));
  const longSegs = uSegs(aHalf);
  const endSegs = uSegs(bHalf);
  const lerp = (x: number, y: number, t: number): number => x + (y - x) * t;

  for (const s of [1, -1]) {
    // Long slope: the ridge segment fans out to the full-length eave edge.
    patch(longSegs, (t, u) => [
      lerp(lerp(-ridgeHalf, ridgeHalf, u), lerp(-aHalf, aHalf, u), t),
      s * bHalf * t,
    ]);
    // Hip end: the ridge tip opens out to the short eave edge. Shares its two
    // hip edges vertex-for-vertex with the long slopes, so the shell is closed.
    patch(endSegs, (t, u) => [s * lerp(ridgeHalf, aHalf, t), lerp(-bHalf, bHalf, u) * t]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** One merged mesh of hip roofs for the roof-eligible chinese buildings. */
function buildChineseRoofs(buildings: BuildingInfo[]): THREE.Mesh | null {
  const eligible = buildings.filter(isRoofEligible);
  if (eligible.length === 0) return null;
  const geometries: THREE.BufferGeometry[] = [];
  const ranges: FaceRange[] = [];
  const color = new THREE.Color();
  let faceOffset = 0;

  eligible.forEach((b, idx) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of b.footprint) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const geo = makeHipRoof(maxX - minX, maxY - minY);
    // Overlap the wall top by a hair so roof and wall meet without a gap
    // (body spans up to position.y + height - 0.3).
    geo.translate(b.position.x, b.position.y + b.height - 0.35, b.position.z);

    color.set(ROOF_TINTS[(b.floors + idx) % ROOF_TINTS.length]!);
    const count = geo.attributes.position!.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Roof faces resolve to the hall id so clicking the roof selects the hall
    // (the roof is the hall's dominant, most-clickable silhouette).
    const faces = count / 3; // non-indexed
    ranges.push({ start: faceOffset, end: faceOffset + faces, id: b.id });
    faceOffset += faces;
    geometries.push(geo);
  });

  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) return null;
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = 'buildings:roofs';
  mesh.castShadow = true;
  mesh.userData.faceRanges = ranges;
  return mesh;
}

export function buildBuildingsGroup(world: MapWorld): BuildingsBuildResult {
  const group = new THREE.Group();
  group.name = 'buildings';
  const instanceIndex = new Map<THREE.InstancedMesh, string[]>();

  const buildings: BuildingInfo[] = [];
  const polygonBuildings: BuildingInfo[] = [];
  const chineseBuildings: BuildingInfo[] = [];
  for (const obj of Object.values(world.objects)) {
    if (obj.objectType !== 'building') continue;
    const b = obj.building;
    if (b.style === 'chinese') {
      // Route through the merged-polygon path: warm walls, no glass facade,
      // pickable via faceRanges (no picker change) — plus a hip roof on top.
      polygonBuildings.push(b);
      chineseBuildings.push(b);
    } else if (isAxisAlignedRect(b.footprint)) {
      buildings.push(b);
    } else {
      polygonBuildings.push(b);
    }
  }

  const poly = buildPolygonBuildings(polygonBuildings);
  if (poly) group.add(poly.mesh);
  const roofs = buildChineseRoofs(chineseBuildings);
  if (roofs) group.add(roofs);

  const byClass: BuildingInfo[][] = CLASSES.map(() => []);
  for (const b of buildings) byClass[classFor(b)]!.push(b);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();
  const dayTextures: THREE.Texture[] = [];
  const nightTextures: THREE.Texture[] = [];
  const sideMaterials: THREE.MeshLambertMaterial[] = [];

  // Rooftop details: setback penthouse caps on high-rises, antennas on towers.
  // Deterministic per building (keyed on floors + index), no RNG needed.
  const caps: Array<{ b: BuildingInfo; w: number; d: number }> = [];
  const antennas: Array<{ b: BuildingInfo; h: number }> = [];
  for (const b of buildings) {
    const fp = b.footprint;
    const w = Math.abs(fp[1]!.x - fp[0]!.x);
    const d = Math.abs(fp[2]!.y - fp[1]!.y);
    if (b.floors >= 9 && (b.floors + fp.length) % 3 !== 0) caps.push({ b, w, d });
    if (b.floors >= 22 && b.floors % 2 === 0) {
      antennas.push({ b, h: 6 + (b.floors % 7) * 1.5 });
    }
  }

  CLASSES.forEach((cls, ci) => {
    const items = byClass[ci]!;
    if (items.length === 0) return;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const dayTex = makeFacadeTexture(cls.texFloors, cls.texCols, { night: false });
    dayTextures[ci] = dayTex;
    const side = new THREE.MeshLambertMaterial({ map: dayTex });
    sideMaterials[ci] = side;
    const roof = new THREE.MeshLambertMaterial({ color: '#565b63' });
    const materials = [side, side, roof, roof, side, side];

    const mesh = new THREE.InstancedMesh(geometry, materials, items.length);
    mesh.name = `buildings:${cls.name}`;

    const ids: string[] = [];
    items.forEach((b, idx) => {
      const fp = b.footprint;
      const w = Math.abs(fp[1]!.x - fp[0]!.x);
      const d = Math.abs(fp[2]!.y - fp[1]!.y);
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y - 0.4, b.position.z),
        quat,
        new THREE.Vector3(w, b.height, d),
      );
      mesh.setMatrixAt(idx, matrix);
      const tints = ci === 3 ? TOWER_TINTS : FACADE_TINTS;
      color.set(tints[(b.floors * 7 + idx) % tints.length]!);
      mesh.setColorAt(idx, color);
      ids.push(b.id);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;

    instanceIndex.set(mesh, ids);
    group.add(mesh);
  });

  if (caps.length > 0) {
    const capGeo = new THREE.BoxGeometry(1, 1, 1);
    capGeo.translate(0, 0.5, 0);
    const capMesh = new THREE.InstancedMesh(
      capGeo,
      new THREE.MeshLambertMaterial({ color: '#6e737c' }),
      caps.length,
    );
    capMesh.name = 'buildings:caps';
    caps.forEach(({ b, w, d }, i) => {
      const capH = 2.2 + (b.floors % 3);
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y + b.height - 0.6, b.position.z),
        quat,
        new THREE.Vector3(w * 0.55, capH, d * 0.55),
      );
      capMesh.setMatrixAt(i, matrix);
    });
    capMesh.instanceMatrix.needsUpdate = true;
    capMesh.castShadow = true;
    group.add(capMesh);
  }

  if (antennas.length > 0) {
    const antGeo = new THREE.CylinderGeometry(0.25, 0.45, 1, 5);
    antGeo.translate(0, 0.5, 0);
    const antMesh = new THREE.InstancedMesh(
      antGeo,
      new THREE.MeshLambertMaterial({ color: '#9aa0a8' }),
      antennas.length,
    );
    antMesh.name = 'buildings:antennas';
    antennas.forEach(({ b, h }, i) => {
      matrix.compose(
        new THREE.Vector3(b.position.x, b.position.y + b.height, b.position.z),
        quat,
        new THREE.Vector3(1, h, 1),
      );
      antMesh.setMatrixAt(i, matrix);
    });
    antMesh.instanceMatrix.needsUpdate = true;
    group.add(antMesh);
  }

  const setNightMode = (night: boolean): void => {
    if (poly) {
      // No per-window texture on merged polygon buildings — a soft warm
      // emissive keeps imported cities alive at night.
      poly.material.emissive.set(night ? '#332b18' : '#000000');
      poly.material.emissiveIntensity = night ? 0.55 : 0;
      poly.material.needsUpdate = true;
    }
    CLASSES.forEach((cls, ci) => {
      const side = sideMaterials[ci];
      if (!side) return;
      if (night && !nightTextures[ci]) {
        nightTextures[ci] = makeFacadeTexture(cls.texFloors, cls.texCols, { night: true });
      }
      side.map = night ? nightTextures[ci]! : dayTextures[ci]!;
      // At night the facade texture carries its own emissive-looking windows.
      side.emissive = night ? new THREE.Color('#ffffff') : new THREE.Color('#000000');
      side.emissiveMap = night ? nightTextures[ci]! : null;
      side.emissiveIntensity = night ? 1.15 : 0;
      side.needsUpdate = true;
    });
  };

  return { group, instanceIndex, polyMesh: poly?.mesh ?? null, roofMesh: roofs, setNightMode };
}
