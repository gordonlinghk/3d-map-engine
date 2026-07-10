import { CHUNK_RESOLUTION, chunkKey } from '@map-engine/core';
import type {
  BuildingInfo,
  District,
  MapChunk,
  MapConfig,
  MapObject,
  MapWorld,
  RoadEdge,
  RoadNode,
  Vec2,
} from '@map-engine/core';
import type { HistoricalCity, HistoricalMapData, LatLon } from './types';

/**
 * Strategy-scale conversion: 1 world unit = 1 km (not 1 m like city maps).
 * Cities become stylized walled compounds sized for readability, terrain
 * comes from a real elevation sampler (visually exaggerated), rivers are
 * ribbon polygons carved into the terrain, and routes become the road graph
 * draped over the relief.
 */

export type HistoricalConvertOptions = {
  /** Real elevation in metres; omit for a flat world (tests/offline). */
  elevation?: (lat: number, lon: number) => number;
  /** World units per metre of elevation (0.012 → a 3,000 m range reads ~36 units). */
  verticalScale?: number;
  /** Sea threshold in metres — at/below renders as water. */
  seaLevel?: number;
};

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;
const SEA_Y = -2;

/** Stylized compound sizes (km) and hall heights (world units) per kind. */
const CITY_STYLE: Record<
  HistoricalCity['kind'],
  { size: number; hall: number; wall: number; label: string }
> = {
  capital: { size: 11, hall: 5.2, wall: 1.6, label: '都城' },
  major: { size: 7.5, hall: 3.6, wall: 1.2, label: '重鎮' },
  town: { size: 5, hall: 2.6, wall: 0.9, label: '城' },
  pass: { size: 3.6, hall: 2.2, wall: 1.1, label: '關隘' },
  site: { size: 3, hall: 1.6, wall: 0, label: '古戰場' },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  attested: '史料明確',
  inferred: '合理推定',
  stylized: '示意',
};

export function historicalToWorld(
  data: HistoricalMapData,
  options: HistoricalConvertOptions = {},
): MapWorld {
  const { elevation, verticalScale = 0.012, seaLevel = 0 } = options;
  const [s, w, n, e] = data.bbox;
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const kmPerDegLon = KM_PER_DEG_LON_EQUATOR * Math.cos((lat0 * Math.PI) / 180);

  const project = (p: LatLon): Vec2 => ({
    x: (p.lon - lon0) * kmPerDegLon,
    y: -(p.lat - lat0) * KM_PER_DEG_LAT, // north = -z
  });

  // --- Config / chunk grid ------------------------------------------------
  const halfX = ((e - w) / 2) * kmPerDegLon;
  const halfZ = ((n - s) / 2) * KM_PER_DEG_LAT;
  const chunkSize = 200;
  const chunksX = Math.max(2, Math.ceil((halfX * 2) / chunkSize));
  const chunksZ = Math.max(2, Math.ceil((halfZ * 2) / chunkSize));
  const worldHalfX = (chunksX * chunkSize) / 2;
  const worldHalfZ = (chunksZ * chunkSize) / 2;

  const config: MapConfig = {
    preset: 'downtown-night-grid',
    chunkSize,
    chunksX,
    chunksZ,
    waterLevel: 0,
    terrain: { maxHeight: 60, hilliness: 0, islandFactor: 0.1 },
    city: { blockSize: 40, buildingDensity: 0.5, maxFloors: 60 },
  };

  const elevAtWorld = (x: number, z: number): number => {
    if (!elevation) return 10; // flat plain
    return elevation(lat0 - z / KM_PER_DEG_LAT, lon0 + x / kmPerDegLon);
  };
  const groundY = (elevMeters: number): number =>
    elevMeters <= seaLevel ? SEA_Y : 1 + (elevMeters - seaLevel) * verticalScale;

  let maxY = 0;
  const chunks: MapWorld['chunks'] = {};
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const res = CHUNK_RESOLUTION;
      const heights = new Array((res + 1) ** 2).fill(0) as number[];
      for (let j = 0; j <= res; j++) {
        for (let i = 0; i <= res; i++) {
          const x = cx * chunkSize + (i / res) * chunkSize - worldHalfX;
          const z = cz * chunkSize + (j / res) * chunkSize - worldHalfZ;
          const y = groundY(elevAtWorld(x, z));
          heights[j * (res + 1) + i] = y;
          maxY = Math.max(maxY, y);
        }
      }
      const chunk: MapChunk = { coord: { cx, cz }, heights, resolution: res, objectIds: [] };
      chunks[chunkKey(chunk.coord)] = chunk;
    }
  }
  config.terrain.maxHeight = Math.max(30, maxY);

  const chunkFor = (p: Vec2): MapChunk | undefined =>
    chunks[
      chunkKey({
        cx: Math.floor((p.x + worldHalfX) / chunkSize),
        cz: Math.floor((p.y + worldHalfZ) / chunkSize),
      })
    ];

  // Bilinear ground lookup against the freshly written chunks.
  const sampleGround = (x: number, z: number): number => {
    const res = CHUNK_RESOLUTION;
    const gx = Math.min(Math.max((x + worldHalfX) / chunkSize, 0), chunksX - 1e-6);
    const gz = Math.min(Math.max((z + worldHalfZ) / chunkSize, 0), chunksZ - 1e-6);
    const chunk = chunks[chunkKey({ cx: Math.floor(gx), cz: Math.floor(gz) })];
    if (!chunk) return 1;
    const fx = (gx - Math.floor(gx)) * res;
    const fz = (gz - Math.floor(gz)) * res;
    const i = Math.min(Math.floor(fx), res - 1);
    const j = Math.min(Math.floor(fz), res - 1);
    const tx = fx - i;
    const tz = fz - j;
    const at = (ii: number, jj: number): number => chunk.heights[jj * (res + 1) + ii]!;
    return (
      (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - tz) +
      (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * tz
    );
  };

  // --- Rivers: polylines → ribbon segments carved into the terrain ---------
  const waterPolygons: Vec2[][] = [];
  for (const river of data.rivers) {
    const pts = river.path.map(project);
    const half = river.widthKm / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;
      // Slight overlap so consecutive segments join without gaps.
      const ex = (dx / len) * half * 0.6;
      const ey = (dy / len) * half * 0.6;
      const ribbon: Vec2[] = [
        { x: a.x + nx - ex, y: a.y + ny - ey },
        { x: b.x + nx + ex, y: b.y + ny + ey },
        { x: b.x - nx + ex, y: b.y - ny + ey },
        { x: a.x - nx - ex, y: a.y - ny - ey },
      ];
      waterPolygons.push(ribbon);
      // Carve the bed: clamp height samples near the segment to below the
      // segment's water level (min ground at its endpoints).
      const level = Math.min(sampleGround(a.x, a.y), sampleGround(b.x, b.y));
      const bed = Math.min(level - 0.6, -0.4);
      carveAlongSegment(chunks, chunkSize, worldHalfX, worldHalfZ, a, b, half + 1.5, bed);
    }
  }

  // --- Objects: stylized walled cities --------------------------------------
  const objects: Record<string, MapObject> = {};
  const registerObject = (obj: MapObject, at: Vec2): void => {
    objects[obj.id] = obj;
    chunkFor(at)?.objectIds.push(obj.id);
  };
  const factionById = new Map(data.factions.map((f) => [f.id, f]));

  let wallN = 0;
  for (const city of data.cities) {
    const c = project(city.position);
    const style = CITY_STYLE[city.kind];
    const faction = factionById.get(city.factionId);
    const ground = sampleGround(c.x, c.y);
    const baseY = Math.max(ground, config.waterLevel + 0.2);
    const sources = city.sources.join(';');

    // Main hall — the selectable, searchable representative of the city.
    const hallHalf = style.size * 0.18;
    const hall: BuildingInfo = {
      id: `city:${data.id}:${city.id}`,
      name: city.name,
      type: 'landmark',
      style: 'chinese',
      category: faction?.name ?? '群雄',
      description: `${faction?.name ?? ''}${style.label} · ${CONFIDENCE_LABEL[city.confidence]}${
        city.modernName ? ` · 今${city.modernName}` : ''
      }${city.notes ? ` — ${city.notes}` : ''}`,
      districtId: `d:${city.factionId}`,
      position: { x: c.x, y: baseY, z: c.y },
      footprint: [
        { x: c.x - hallHalf, y: c.y - hallHalf },
        { x: c.x + hallHalf, y: c.y - hallHalf },
        { x: c.x + hallHalf, y: c.y + hallHalf },
        { x: c.x - hallHalf, y: c.y + hallHalf },
      ],
      height: style.hall,
      floors: Math.max(1, Math.round(style.hall)),
      tags: ['Named', faction?.name ?? '群雄', style.label, CONFIDENCE_LABEL[city.confidence]!],
      source: 'imported',
      metadata: {
        imported: true,
        historical: true,
        faction: faction?.name ?? '',
        kind: city.kind,
        confidence: city.confidence,
        sources,
        ...(city.modernName ? { modern: city.modernName } : {}),
      },
    };
    registerObject({ objectType: 'building', id: hall.id, building: hall }, c);

    // Walls: four low slabs around the compound (skipped for battle sites).
    if (style.wall > 0) {
      const half = style.size / 2;
      const t = Math.max(0.5, style.size * 0.07); // wall thickness
      const segments: Array<[Vec2, Vec2]> = [
        [{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half + t }],
        [{ x: c.x - half, y: c.y + half - t }, { x: c.x + half, y: c.y + half }],
        [{ x: c.x - half, y: c.y - half + t }, { x: c.x - half + t, y: c.y + half - t }],
        [{ x: c.x + half - t, y: c.y - half + t }, { x: c.x + half, y: c.y + half - t }],
      ];
      for (const [a, b] of segments) {
        wallN += 1;
        const id = `wall:${data.id}:${wallN}`;
        const wall: BuildingInfo = {
          id,
          name: `${city.name}城牆`,
          // 'residential' keeps walls out of the searchable entries list.
          type: 'residential',
          style: 'chinese',
          category: 'Wall',
          description: `${city.name}的城垣(示意)。`,
          districtId: `d:${city.factionId}`,
          position: { x: (a.x + b.x) / 2, y: baseY, z: (a.y + b.y) / 2 },
          footprint: [
            { x: a.x, y: a.y },
            { x: b.x, y: a.y },
            { x: b.x, y: b.y },
            { x: a.x, y: b.y },
          ],
          height: style.wall,
          floors: 1,
          tags: ['Wall'],
          source: 'imported',
          metadata: { imported: true, historical: true },
        };
        registerObject(
          { objectType: 'building', id, building: wall },
          { x: wall.position.x, y: wall.position.z },
        );
      }
    }
  }

  // --- Routes → road graph ---------------------------------------------------
  const cityById = new Map(data.cities.map((c) => [c.id, c]));
  const roadNodes = new Map<string, RoadNode>();
  const roadEdges: RoadEdge[] = [];
  const nodeFor = (cityId: string): string | null => {
    const city = cityById.get(cityId);
    if (!city) return null;
    const id = `rn:hist:${cityId}`;
    if (!roadNodes.has(id)) {
      const p = project(city.position);
      roadNodes.set(id, {
        id,
        position: { x: p.x, y: Math.max(sampleGround(p.x, p.y), config.waterLevel + 0.3), z: p.y },
      });
    }
    return id;
  };
  for (const route of data.routes) {
    for (let i = 0; i < route.cities.length - 1; i++) {
      const from = nodeFor(route.cities[i]!);
      const to = nodeFor(route.cities[i + 1]!);
      if (!from || !to) continue;
      roadEdges.push({ id: `re:hist:${route.id}:${i}`, from, to, kind: 'avenue', width: 1.6 });
    }
  }

  // --- Districts: whole map + factions ----------------------------------------
  const districts: District[] = [
    {
      id: 'd:hist',
      name: data.name,
      kind: 'downtown',
      boundary: [
        { x: -halfX, y: -halfZ },
        { x: halfX, y: -halfZ },
        { x: halfX, y: halfZ },
        { x: -halfX, y: halfZ },
      ],
      center: { x: 0, y: 0 },
    },
    ...data.factions.map((f): District => {
      const boundary = f.boundary.map(project);
      const center = boundary.reduce(
        (acc, p) => ({ x: acc.x + p.x / boundary.length, y: acc.y + p.y / boundary.length }),
        { x: 0, y: 0 },
      );
      return { id: `d:${f.id}`, name: f.name, kind: 'commercial', boundary, center };
    }),
  ];

  return {
    id: `hist:${data.id}`,
    seed: `hist-${data.id}`,
    config,
    chunks,
    objects,
    districts,
    blocks: [],
    roadGraph: { nodes: [...roadNodes.values()], edges: roadEdges },
    landmarks: [],
    waterPolygons,
    greenPolygons: [],
    attribution: [...data.attribution, data.disclaimer],
  };
}

/** Clamp height samples within `radius` of segment a–b down to `bed`. */
function carveAlongSegment(
  chunks: MapWorld['chunks'],
  chunkSize: number,
  worldHalfX: number,
  worldHalfZ: number,
  a: Vec2,
  b: Vec2,
  radius: number,
  bed: number,
): void {
  const res = CHUNK_RESOLUTION;
  const minX = Math.min(a.x, b.x) - radius;
  const maxX = Math.max(a.x, b.x) + radius;
  const minZ = Math.min(a.y, b.y) - radius;
  const maxZ = Math.max(a.y, b.y) + radius;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLen2 = abx * abx + aby * aby || 1;
  for (const chunk of Object.values(chunks)) {
    const originX = chunk.coord.cx * chunkSize - worldHalfX;
    const originZ = chunk.coord.cz * chunkSize - worldHalfZ;
    if (originX > maxX || originX + chunkSize < minX || originZ > maxZ || originZ + chunkSize < minZ) {
      continue;
    }
    for (let j = 0; j <= res; j++) {
      for (let i = 0; i <= res; i++) {
        const x = originX + (i / res) * chunkSize;
        const z = originZ + (j / res) * chunkSize;
        if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
        const t = Math.min(Math.max(((x - a.x) * abx + (z - a.y) * aby) / abLen2, 0), 1);
        const dx = x - (a.x + t * abx);
        const dz = z - (a.y + t * aby);
        if (dx * dx + dz * dz > radius * radius) continue;
        const index = j * (res + 1) + i;
        chunk.heights[index] = Math.min(chunk.heights[index]!, bed);
      }
    }
  }
}
