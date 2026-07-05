export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export type MapPresetId = 'coastal-tech-city' | 'island-city' | 'downtown-night-grid';

export type MapObjectType =
  | 'building'
  | 'landmark'
  | 'road'
  | 'bridge'
  | 'tree'
  | 'district'
  | 'poi';

export type BuildingType = 'company' | 'residential' | 'landmark' | 'public' | 'transport';

export type BuildingInfo = {
  id: string;
  name: string;
  type: BuildingType;
  category?: string;
  description: string;
  districtId: string;
  position: Vec3;
  footprint: Vec2[];
  height: number;
  floors: number;
  tags: string[];
  source: 'procedural' | 'imported' | 'user-defined';
  metadata?: Record<string, string | number | boolean>;
};

export type LandmarkKind = 'bridge' | 'tower' | 'stadium' | 'pier' | 'park' | 'island';

export type LandmarkInfo = {
  id: string;
  name: string;
  kind: LandmarkKind;
  description: string;
  position: Vec3;
  tags: string[];
  metadata?: Record<string, string | number | boolean>;
};

export type DistrictKind = 'downtown' | 'commercial' | 'residential' | 'landmark' | 'green' | 'waterfront';

export type District = {
  id: string;
  name: string;
  kind: DistrictKind;
  /** Polygon in world XZ coordinates. */
  boundary: Vec2[];
  center: Vec2;
};

export type RoadKind = 'highway' | 'avenue' | 'street' | 'bridge';

export type RoadNode = {
  id: string;
  position: Vec3;
};

export type RoadEdge = {
  id: string;
  from: string;
  to: string;
  kind: RoadKind;
  width: number;
};

export type RoadGraph = {
  nodes: RoadNode[];
  edges: RoadEdge[];
};

export type ChunkCoord = { cx: number; cz: number };

/** Stable string key for a chunk coordinate, e.g. "3,-2". */
export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

export type MapChunk = {
  coord: ChunkCoord;
  /** Row-major (resolution+1)^2 height samples in world Y units. */
  heights: number[];
  /** Samples per chunk edge (heights has (resolution+1)^2 entries). */
  resolution: number;
  /** Ids of objects whose anchor position falls inside this chunk. */
  objectIds: string[];
};

export type ChunkIndex = Record<string, MapChunk>;

export type MapObject =
  | { objectType: 'building'; id: string; building: BuildingInfo }
  | { objectType: 'landmark'; id: string; landmark: LandmarkInfo }
  | {
      objectType: 'tree' | 'poi';
      id: string;
      name: string;
      position: Vec3;
      tags: string[];
    };

export type TerrainConfig = {
  /** Maximum terrain height above sea level in world units. */
  maxHeight: number;
  /** 0..1 — how hilly the noise field is. */
  hilliness: number;
  /** 0..1 — how strongly land falls off into ocean at map edges. */
  islandFactor: number;
};

export type CityConfig = {
  /** Approximate city block size in world units. */
  blockSize: number;
  /** 0..1 building fill density inside blocks. */
  buildingDensity: number;
  maxFloors: number;
};

export type MapConfig = {
  preset: MapPresetId;
  /** World units per chunk edge. */
  chunkSize: number;
  chunksX: number;
  chunksZ: number;
  /** Sea level in world Y units. */
  waterLevel: number;
  terrain: TerrainConfig;
  city: CityConfig;
};

export type CityBlockKind = 'downtown' | 'commercial' | 'residential' | 'waterfront' | 'park';

/** One city block (the cell between adjacent grid streets). */
export type CityBlock = {
  i: number;
  j: number;
  center: Vec2;
  kind: CityBlockKind;
};

export type MapWorld = {
  id: string;
  seed: string;
  config: MapConfig;
  chunks: ChunkIndex;
  objects: Record<string, MapObject>;
  districts: District[];
  blocks: CityBlock[];
  roadGraph: RoadGraph;
  landmarks: LandmarkInfo[];
};

export const SERIALIZATION_VERSION = 1;

export type SerializedMap = {
  version: typeof SERIALIZATION_VERSION;
  world: MapWorld;
};

export type MapLayerId =
  | 'terrain'
  | 'water'
  | 'roads'
  | 'buildings'
  | 'landmarks'
  | 'labels'
  | 'trees'
  | 'traffic';
