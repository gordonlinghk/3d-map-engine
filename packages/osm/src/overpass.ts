import type { BBox, OsmResponse } from './types';

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export function buildOverpassQuery(bbox: BBox): string {
  const [s, w, n, e] = bbox;
  return `[out:json][timeout:60][bbox:${s},${w},${n},${e}];
(
  way["building"];
  way["highway"];
  way["natural"="water"];
  way["waterway"="riverbank"];
  way["leisure"~"park|garden|pitch"];
  way["landuse"~"grass|forest|recreation_ground|meadow"];
);
(._;>;);
out body;`;
}

/** Fetch an area from the Overpass API (browser and Node 18+). */
export async function fetchOsmArea(
  bbox: BBox,
  options: { endpoint?: string; signal?: AbortSignal } = {},
): Promise<OsmResponse> {
  const response = await fetch(options.endpoint ?? DEFAULT_ENDPOINT, {
    signal: options.signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass rejects UA-less requests (HTTP 406) — Node's fetch sends no
      // User-Agent by default; browsers ignore this header (forbidden) and
      // send their own.
      'User-Agent': '3d-map-engine (github.com/gordonlinghk/3d-map-engine)',
    },
    body: `data=${encodeURIComponent(buildOverpassQuery(bbox))}`,
  });
  if (!response.ok) {
    throw new Error(`Overpass API error ${response.status} — try again in a minute.`);
  }
  return (await response.json()) as OsmResponse;
}
