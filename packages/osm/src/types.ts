/** Bounding box in degrees: [south, west, north, east]. */
export type BBox = [number, number, number, number];

export type OsmNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

export type OsmWay = {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};

export type OsmRelation = {
  type: 'relation';
  id: number;
  members: Array<{ type: string; ref: number; role: string }>;
  tags?: Record<string, string>;
};

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export type OsmResponse = {
  elements: OsmElement[];
};

export type CityPreset = {
  slug: string;
  name: string;
  bbox: BBox;
};
