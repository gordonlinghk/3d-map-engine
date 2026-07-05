import { CHUNK_RESOLUTION, chunkKey } from '@map-engine/core';
import type {
  BuildingInfo,
  BuildingType,
  MapChunk,
  MapConfig,
  MapObject,
  MapWorld,
  RoadEdge,
  RoadKind,
  RoadNode,
  Vec2,
} from '@map-engine/core';
import type { BBox, OsmNode, OsmResponse, OsmWay } from './types';

/** Flat ground height for imported cities (no elevation data in v1). */
export const OSM_GROUND = 2;

export type OsmConvertOptions = {
  /** Display name, e.g. "Tokyo Shibuya". */
  name: string;
  bbox: BBox;
  /** Cap on scattered park trees. */
  maxTrees?: number;
};

// --- Small geometry helpers -------------------------------------------------

function polygonArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function centroid(points: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Deterministic small hash for fallback values. */
function hashId(id: number): number {
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return (h >>> 8) / 16777216;
}

// --- Tag interpretation -------------------------------------------------------

function parseHeight(tags: Record<string, string>, wayId: number): { height: number; floors: number } {
  const rawHeight = tags.height ?? tags['building:height'];
  if (rawHeight) {
    const h = parseFloat(rawHeight.replace(/m$/i, '').trim());
    if (Number.isFinite(h) && h > 2) return { height: h, floors: Math.max(1, Math.round(h / 3.2)) };
  }
  const levels = parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) {
    return { height: levels * 3.2, floors: Math.round(levels) };
  }
  // Unknown: plausible low/mid-rise, deterministic per way.
  const floors = 2 + Math.floor(hashId(wayId) * 6);
  return { height: floors * 3.2, floors };
}

function buildingTypeFor(tag: string): BuildingType {
  if (/^(residential|apartments|house|detached|dormitory|terrace|semidetached_house)$/.test(tag)) {
    return 'residential';
  }
  if (/^(school|university|hospital|civic|public|government|church|temple|shrine|museum)$/.test(tag)) {
    return 'public';
  }
  if (/^(train_station|station|transportation)$/.test(tag)) return 'transport';
  return 'company';
}

const ROAD_KIND_MAP: Record<string, { kind: RoadKind; width: number }> = {
  motorway: { kind: 'highway', width: 14 },
  motorway_link: { kind: 'highway', width: 10 },
  trunk: { kind: 'highway', width: 13 },
  trunk_link: { kind: 'highway', width: 10 },
  primary: { kind: 'avenue', width: 11 },
  primary_link: { kind: 'avenue', width: 9 },
  secondary: { kind: 'avenue', width: 10 },
  secondary_link: { kind: 'avenue', width: 8 },
  tertiary: { kind: 'street', width: 8 },
  tertiary_link: { kind: 'street', width: 7 },
  residential: { kind: 'street', width: 6 },
  unclassified: { kind: 'street', width: 6 },
  living_street: { kind: 'street', width: 5 },
  pedestrian: { kind: 'street', width: 5 },
  service: { kind: 'street', width: 4 },
};

// --- Conversion ---------------------------------------------------------------

export function osmToWorld(data: OsmResponse, options: OsmConvertOptions): MapWorld {
  const { name, bbox } = options;
  const [s, w, n, e] = bbox;
  const lat0 = (s + n) / 2;
  const lon0 = (w + e) / 2;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const project = (lat: number, lon: number): Vec2 => ({
    x: (lon - lon0) * mPerDegLon,
    y: -(lat - lat0) * mPerDegLat, // north = -z
  });

  const nodes = new Map<number, OsmNode>();
  const ways: OsmWay[] = [];
  for (const el of data.elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.push(el);
  }

  const wayPoints = (way: OsmWay): Vec2[] => {
    const pts: Vec2[] = [];
    for (const ref of way.nodes) {
      const nd = nodes.get(ref);
      if (nd) pts.push(project(nd.lat, nd.lon));
    }
    return pts;
  };

  // --- World extents / flat chunks ------------------------------------------
  const halfX = ((e - w) / 2) * mPerDegLon;
  const halfZ = ((n - s) / 2) * mPerDegLat;
  const chunkSize = 200;
  const chunksX = Math.max(2, Math.ceil((halfX * 2) / chunkSize));
  const chunksZ = Math.max(2, Math.ceil((halfZ * 2) / chunkSize));

  const config: MapConfig = {
    preset: 'downtown-night-grid',
    chunkSize,
    chunksX,
    chunksZ,
    waterLevel: 0,
    terrain: { maxHeight: 25, hilliness: 0, islandFactor: 0.1 },
    city: { blockSize: 40, buildingDensity: 0.5, maxFloors: 60 },
  };

  const chunks: MapWorld['chunks'] = {};
  const flat = new Array((CHUNK_RESOLUTION + 1) ** 2).fill(OSM_GROUND) as number[];
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const chunk: MapChunk = {
        coord: { cx, cz },
        heights: [...flat],
        resolution: CHUNK_RESOLUTION,
        objectIds: [],
      };
      chunks[chunkKey(chunk.coord)] = chunk;
    }
  }
  const worldHalfX = (chunksX * chunkSize) / 2;
  const worldHalfZ = (chunksZ * chunkSize) / 2;
  const chunkFor = (p: Vec2): MapChunk | undefined =>
    chunks[
      chunkKey({
        cx: Math.floor((p.x + worldHalfX) / chunkSize),
        cz: Math.floor((p.y + worldHalfZ) / chunkSize),
      })
    ];

  const objects: Record<string, MapObject> = {};
  const registerObject = (obj: MapObject, at: Vec2): void => {
    objects[obj.id] = obj;
    chunkFor(at)?.objectIds.push(obj.id);
  };

  // --- Buildings --------------------------------------------------------------
  for (const way of ways) {
    const tags = way.tags;
    if (!tags?.building) continue;
    const pts = wayPoints(way);
    // Closed polygon: OSM repeats the first node at the end — drop it.
    if (pts.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1]) pts.pop();
    if (pts.length < 3) continue;
    if (polygonArea(pts) < 12) continue; // ignore sheds/kiosks

    const { height, floors } = parseHeight(tags, way.id);
    const center = centroid(pts);
    const buildingTag = tags.building === 'yes' ? (tags.amenity ?? 'building') : tags.building!;
    const displayName =
      tags['name:en'] ?? tags.name ?? `${buildingTag[0]!.toUpperCase()}${buildingTag.slice(1)} ${way.id % 1000}`;
    const address = [tags['addr:housenumber'], tags['addr:street'] ?? tags['addr:quarter']]
      .filter(Boolean)
      .join(' ');

    const building: BuildingInfo = {
      id: `bldg:osm:${way.id}`,
      name: displayName,
      type: buildingTypeFor(tags.building!),
      category: buildingTag,
      description: tags.name
        ? `${buildingTag} · imported from OpenStreetMap`
        : `Unnamed ${buildingTag} imported from OpenStreetMap`,
      districtId: 'd:osm',
      position: { x: center.x, y: OSM_GROUND, z: center.y },
      footprint: pts,
      height,
      floors,
      tags: [buildingTag, 'OSM', ...(tags.name ? ['Named'] : [])],
      source: 'imported',
      metadata: {
        imported: true,
        osmWay: way.id,
        ...(address ? { address } : {}),
        ...(tags['building:levels'] ? { levels: tags['building:levels'] } : {}),
      },
    };
    registerObject({ objectType: 'building', id: building.id, building }, center);

  }

  // --- Roads --------------------------------------------------------------------
  const roadNodes = new Map<string, RoadNode>();
  const roadEdges: RoadEdge[] = [];
  for (const way of ways) {
    const highway = way.tags?.highway;
    if (!highway) continue;
    const mapping = ROAD_KIND_MAP[highway];
    if (!mapping) continue;

    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = nodes.get(way.nodes[i]!);
      const b = nodes.get(way.nodes[i + 1]!);
      if (!a || !b) continue;
      const pa = project(a.lat, a.lon);
      const pb = project(b.lat, b.lon);
      const fromId = `rn:osm:${a.id}`;
      const toId = `rn:osm:${b.id}`;
      if (!roadNodes.has(fromId)) {
        roadNodes.set(fromId, { id: fromId, position: { x: pa.x, y: OSM_GROUND, z: pa.y } });
      }
      if (!roadNodes.has(toId)) {
        roadNodes.set(toId, { id: toId, position: { x: pb.x, y: OSM_GROUND, z: pb.y } });
      }
      roadEdges.push({
        id: `re:osm:${way.id}:${i}`,
        from: fromId,
        to: toId,
        kind: mapping.kind,
        width: mapping.width,
      });
    }
  }

  // --- Water & green areas --------------------------------------------------------
  const waterPolygons: Vec2[][] = [];
  const greenPolygons: Vec2[][] = [];
  for (const way of ways) {
    const tags = way.tags;
    if (!tags) continue;
    const isWater = tags.natural === 'water' || tags.waterway === 'riverbank';
    const isGreen =
      /park|garden|pitch/.test(tags.leisure ?? '') ||
      /grass|forest|recreation_ground|meadow/.test(tags.landuse ?? '');
    if (!isWater && !isGreen) continue;
    const pts = wayPoints(way);
    if (pts.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1]) pts.pop();
    if (pts.length < 3 || polygonArea(pts) < 40) continue;
    (isWater ? waterPolygons : greenPolygons).push(pts);
  }

  // --- Trees in green areas ---------------------------------------------------------
  const maxTrees = options.maxTrees ?? 1200;
  let treeN = 0;
  for (const poly of greenPolygons) {
    if (treeN >= maxTrees) break;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    for (let x = minX + 8; x < maxX; x += 17) {
      for (let y = minY + 8; y < maxY; y += 17) {
        if (treeN >= maxTrees) break;
        const jx = x + (hashId(Math.round(x * 7 + y)) - 0.5) * 8;
        const jy = y + (hashId(Math.round(y * 13 + x)) - 0.5) * 8;
        if (!pointInPolygon({ x: jx, y: jy }, poly)) continue;
        const id = `tree:osm:${treeN}`;
        registerObject(
          {
            objectType: 'tree',
            id,
            name: 'Tree',
            position: { x: jx, y: OSM_GROUND, z: jy },
            tags: ['Tree'],
          },
          { x: jx, y: jy },
        );
        treeN += 1;
      }
    }
  }

  return {
    id: `osm:${name}`,
    seed: `osm-${name}`,
    config,
    chunks,
    objects,
    districts: [
      {
        id: 'd:osm',
        name,
        kind: 'downtown',
        boundary: [
          { x: -halfX, y: -halfZ },
          { x: halfX, y: -halfZ },
          { x: halfX, y: halfZ },
          { x: -halfX, y: halfZ },
        ],
        center: { x: 0, y: 0 },
      },
    ],
    blocks: [],
    roadGraph: { nodes: [...roadNodes.values()], edges: roadEdges },
    landmarks: [],
    waterPolygons,
    greenPolygons,
  };
}

export type { OsmResponse };
