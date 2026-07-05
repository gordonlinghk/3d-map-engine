import { fetchOsmArea } from './overpass';
import type { BBox, OsmElement, OsmResponse } from './types';

/**
 * Tiled OSM fetching for areas beyond what a single Overpass request can
 * serve politely. The target bbox is split into ~tile-sized cells fetched
 * sequentially with a delay (public Overpass etiquette), retried with
 * backoff, then merged with de-duplication (ways spanning tile borders and
 * their nodes appear in several tiles). Used by the `pnpm bake` CLI, and
 * available to SDK consumers who pre-bake worlds for their own apps.
 */

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/** Split a bbox into a row-major grid of tiles no larger than `tileKm`. */
export function splitBBox(bbox: BBox, tileKm: number): BBox[] {
  const [s, w, n, e] = bbox;
  const midLat = (s + n) / 2;
  const heightKm = (n - s) * KM_PER_DEG_LAT;
  const widthKm = (e - w) * KM_PER_DEG_LON_EQUATOR * Math.cos((midLat * Math.PI) / 180);
  const rows = Math.max(1, Math.ceil(heightKm / tileKm));
  const cols = Math.max(1, Math.ceil(widthKm / tileKm));
  const dLat = (n - s) / rows;
  const dLon = (e - w) / cols;
  const tiles: BBox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push([s + r * dLat, w + c * dLon, s + (r + 1) * dLat, w + (c + 1) * dLon]);
    }
  }
  return tiles;
}

/** Merge Overpass responses, de-duplicating elements by type + id. */
export function mergeOsmResponses(responses: OsmResponse[]): OsmResponse {
  const seen = new Set<string>();
  const elements: OsmElement[] = [];
  for (const response of responses) {
    for (const el of response.elements) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      elements.push(el);
    }
  }
  return { elements };
}

export type TiledFetchProgress = {
  /** 1-based index of the tile that just finished. */
  tile: number;
  tiles: number;
  bbox: BBox;
  /** Element count of this tile's response. */
  elements: number;
  attempt: number;
};

export type TiledFetchOptions = {
  /** Max tile edge in km (default 1.2 — a comfortable single Overpass call). */
  tileKm?: number;
  /** Pause between tile requests in ms (default 1500 — public-server etiquette). */
  delayMs?: number;
  /** Retry attempts per tile after the first try (default 3, backoff 5s/15s/45s). */
  retries?: number;
  onProgress?: (progress: TiledFetchProgress) => void;
  /** Injectable for tests. */
  fetchArea?: (bbox: BBox) => Promise<OsmResponse>;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a large area tile by tile and return one merged OsmResponse, ready
 * for `osmToWorld(merged, { name, bbox })` with the full bbox.
 */
export async function fetchOsmAreaTiled(
  bbox: BBox,
  options: TiledFetchOptions = {},
): Promise<OsmResponse> {
  const {
    tileKm = 1.2,
    delayMs = 1500,
    retries = 3,
    onProgress,
    fetchArea = fetchOsmArea,
    sleep = defaultSleep,
  } = options;
  const tiles = splitBBox(bbox, tileKm);
  const responses: OsmResponse[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i]!;
    let lastError: unknown;
    let response: OsmResponse | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(5000 * 3 ** (attempt - 1)); // 5s, 15s, 45s
      try {
        response = await fetchArea(tile);
        onProgress?.({ tile: i + 1, tiles: tiles.length, bbox: tile, elements: response.elements.length, attempt: attempt + 1 });
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!response) {
      throw new Error(
        `Tile ${i + 1}/${tiles.length} [${tile.join(',')}] failed after ${retries + 1} attempts: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`,
      );
    }
    responses.push(response);
    if (i < tiles.length - 1 && delayMs > 0) await sleep(delayMs);
  }
  return mergeOsmResponses(responses);
}
