import type { BBox } from './types';

/**
 * City geocoding: turn a free-text city name into candidate places with real
 * coordinates, so the demo (or any SDK consumer) can fetch the surrounding
 * OSM extract. The provider is an interface — the default implementation is
 * Photon (photon.komoot.io: OSM-based, no API key, explicitly built for
 * autocomplete; Nominatim's usage policy forbids as-you-type search). Keyed
 * providers (Mapbox, Google Places…) can be added behind the same interface
 * without touching the UI.
 */

export type CityCandidate = {
  /** Stable provider-scoped id, e.g. "photon:R71525". */
  id: string;
  /** Place name, e.g. "Paris". */
  name: string;
  /** State / region, when known. */
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  /** Provider bounding box [south, west, north, east], when known. */
  bbox?: BBox;
  /** Human-readable disambiguation label, e.g. "Paris — Île-de-France, France". */
  label: string;
  provider: string;
};

export interface GeocodingProvider {
  readonly name: string;
  /** Search candidate cities/places for a free-text query. */
  searchCities(
    query: string,
    options?: { limit?: number; signal?: AbortSignal },
  ): Promise<CityCandidate[]>;
}

/* ------------------------------------------------------------------ */
/* Photon (default provider)                                           */
/* ------------------------------------------------------------------ */

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

/** Place kinds we surface as "cities" (districts included — they convert well). */
const PLACE_VALUES = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'borough',
  'suburb',
  'quarter',
  'neighbourhood',
  'municipality',
  'district',
]);

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
    /** [west, north, east, south] */
    extent?: [number, number, number, number];
  };
};

function candidateLabel(name: string, region?: string, country?: string): string {
  const where = [region, country].filter((p) => p && p !== name).join(', ');
  return where ? `${name} — ${where}` : name;
}

export function createPhotonProvider(
  options: {
    endpoint?: string;
    /** Injectable for tests; defaults to global fetch. */
    fetchFn?: typeof fetch;
    /** Preferred result language (Photon supports e.g. 'en', 'de', 'fr'). */
    lang?: string;
  } = {},
): GeocodingProvider {
  const endpoint = options.endpoint ?? PHOTON_ENDPOINT;
  const fetchFn = options.fetchFn ?? fetch;
  return {
    name: 'photon',
    async searchCities(query, { limit = 8, signal } = {}) {
      const url = new URL(endpoint);
      url.searchParams.set('q', query);
      // Over-fetch a little so post-filtering still fills the list.
      url.searchParams.set('limit', String(Math.min(limit * 2, 20)));
      if (options.lang) url.searchParams.set('lang', options.lang);
      let response: Response;
      try {
        response = await fetchFn(url.toString(), { signal });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') throw err;
        throw new Error('City search is unreachable — check your network and try again.');
      }
      if (response.status === 429) {
        throw new Error('City search is rate-limited right now — wait a moment and try again.');
      }
      if (!response.ok) {
        throw new Error(`City search failed (HTTP ${response.status}) — try again shortly.`);
      }
      let data: { features?: PhotonFeature[] };
      try {
        data = (await response.json()) as { features?: PhotonFeature[] };
      } catch {
        throw new Error('City search returned an unexpected response — try again shortly.');
      }
      if (!Array.isArray(data.features)) return [];

      const out: CityCandidate[] = [];
      const seen = new Set<string>();
      for (const f of data.features) {
        const p = f.properties;
        const coords = f.geometry?.coordinates;
        if (!p?.name || !coords || coords.length < 2) continue;
        const isPlace = p.osm_key === 'place' && PLACE_VALUES.has(p.osm_value ?? '');
        const isBoundary = p.osm_key === 'boundary' && p.osm_value === 'administrative';
        if (!isPlace && !isBoundary) continue;
        const id = `photon:${p.osm_type ?? '?'}${p.osm_id ?? '?'}`;
        // Photon often returns a place node AND its admin boundary for the
        // same city — dedupe on the display label as well as the id.
        const labelKey = candidateLabel(p.name, p.state, p.country);
        if (seen.has(id) || seen.has(labelKey)) continue;
        seen.add(id);
        seen.add(labelKey);
        const [lon, lat] = coords;
        const extent = p.extent;
        out.push({
          id,
          name: p.name,
          region: p.state,
          country: p.country,
          lat,
          lon,
          // Photon extent is [west, north, east, south] → BBox [s, w, n, e].
          bbox: extent ? [extent[3], extent[0], extent[1], extent[2]] : undefined,
          label: candidateLabel(p.name, p.state, p.country),
          provider: 'photon',
        });
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mock provider (offline dev, unit tests, SDK examples)               */
/* ------------------------------------------------------------------ */

const MOCK_CITIES: CityCandidate[] = [
  { id: 'mock:1', name: 'London', region: 'England', country: 'United Kingdom', lat: 51.5074, lon: -0.1278, bbox: [51.28, -0.51, 51.69, 0.33], label: 'London — England, United Kingdom', provider: 'mock' },
  { id: 'mock:2', name: 'London', region: 'Ontario', country: 'Canada', lat: 42.9849, lon: -81.2453, label: 'London — Ontario, Canada', provider: 'mock' },
  { id: 'mock:3', name: 'Paris', region: 'Île-de-France', country: 'France', lat: 48.8566, lon: 2.3522, bbox: [48.8156, 2.2241, 48.9022, 2.4698], label: 'Paris — Île-de-France, France', provider: 'mock' },
  { id: 'mock:4', name: 'Paris', region: 'Texas', country: 'United States', lat: 33.6609, lon: -95.5555, label: 'Paris — Texas, United States', provider: 'mock' },
  { id: 'mock:5', name: 'Hong Kong', country: 'China', lat: 22.2793, lon: 114.1628, label: 'Hong Kong — China', provider: 'mock' },
  { id: 'mock:6', name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, label: 'Tokyo — Japan', provider: 'mock' },
  { id: 'mock:7', name: 'New York', region: 'New York', country: 'United States', lat: 40.7128, lon: -74.006, label: 'New York — New York, United States', provider: 'mock' },
];

export function createMockGeocodingProvider(): GeocodingProvider {
  return {
    name: 'mock',
    searchCities(query, { limit = 8 } = {}) {
      const q = query.trim().toLowerCase();
      return Promise.resolve(
        MOCK_CITIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit),
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Candidate → fetchable city area                                     */
/* ------------------------------------------------------------------ */

/**
 * Target extract size. Whole-city bounding boxes (Greater London ≈ 45 km)
 * are far beyond what Overpass + the low-poly renderer are meant for; the
 * curated presets are ~1.2–1.8 km, so searched cities get a same-sized window
 * centred on the place. A smaller provider extent (a district) is kept as-is.
 */
const SPAN_LAT_KM = 1.3;
const SPAN_LON_KM = 1.8;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

export function candidateToCityArea(
  candidate: Pick<CityCandidate, 'lat' | 'lon' | 'bbox' | 'label'>,
): {
  slug: string;
  name: string;
  bbox: BBox;
} {
  const halfLat = SPAN_LAT_KM / 2 / KM_PER_DEG_LAT;
  const cosLat = Math.max(0.2, Math.cos((candidate.lat * Math.PI) / 180));
  const halfLon = SPAN_LON_KM / 2 / (KM_PER_DEG_LON_EQUATOR * cosLat);

  let bbox: BBox = [
    candidate.lat - halfLat,
    candidate.lon - halfLon,
    candidate.lat + halfLat,
    candidate.lon + halfLon,
  ];
  const ext = candidate.bbox;
  if (ext) {
    const extSpanLat = ext[2] - ext[0];
    const extSpanLon = ext[3] - ext[1];
    // Provider extent smaller than our window → the place is small; use it.
    if (extSpanLat > 0 && extSpanLon > 0 && extSpanLat <= halfLat * 2 && extSpanLon <= halfLon * 2) {
      bbox = ext;
    }
  }
  const round = (v: number): number => Math.round(v * 1e5) / 1e5;
  bbox = [round(bbox[0]), round(bbox[1]), round(bbox[2]), round(bbox[3])];
  return {
    slug: `bbox:${bbox.join(',')}`,
    name: candidate.label,
    bbox,
  };
}

/** Parse a "bbox:s,w,n,e" slug (or bare "s,w,n,e") back into a BBox. */
export function parseBBoxSlug(value: string): BBox | null {
  const raw = value.startsWith('bbox:') ? value.slice(5) : value;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) return null;
  const [s, w, n, e] = parts as [number, number, number, number];
  if (s >= n || w >= e || Math.abs(s) > 90 || Math.abs(n) > 90 || Math.abs(w) > 180 || Math.abs(e) > 180) {
    return null;
  }
  // Refuse extracts that would flood Overpass (≈ >6 km per side).
  if (n - s > 0.06 || e - w > 0.09) return null;
  return [s, w, n, e];
}
