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
    searchCities(query: string, options?: {
        limit?: number;
        signal?: AbortSignal;
    }): Promise<CityCandidate[]>;
}
export declare function createPhotonProvider(options?: {
    endpoint?: string;
    /** Injectable for tests; defaults to global fetch. */
    fetchFn?: typeof fetch;
    /** Preferred result language (Photon supports e.g. 'en', 'de', 'fr'). */
    lang?: string;
}): GeocodingProvider;
export declare function createMockGeocodingProvider(): GeocodingProvider;
export declare function candidateToCityArea(candidate: Pick<CityCandidate, 'lat' | 'lon' | 'bbox' | 'label'>): {
    slug: string;
    name: string;
    bbox: BBox;
};
/** Parse a "bbox:s,w,n,e" slug (or bare "s,w,n,e") back into a BBox. */
export declare function parseBBoxSlug(value: string): BBox | null;
