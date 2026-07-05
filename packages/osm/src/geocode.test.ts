import { describe, expect, it } from 'vitest';
import {
  candidateToCityArea,
  createMockGeocodingProvider,
  createPhotonProvider,
  parseBBoxSlug,
} from './geocode';
import type { CityCandidate } from './geocode';

/** Photon fixture: Paris (FR, boundary), Paris (Texas, place/city), a street (filtered out). */
const PHOTON_FIXTURE = {
  features: [
    {
      geometry: { coordinates: [2.3483915, 48.8534951], type: 'Point' },
      properties: {
        osm_type: 'R',
        osm_id: 71525,
        extent: [2.224122, 48.902156, 2.4697602, 48.8155755],
        country: 'France',
        osm_key: 'boundary',
        osm_value: 'administrative',
        name: 'Paris',
        state: 'Île-de-France',
      },
    },
    {
      geometry: { coordinates: [-95.555513, 33.6609389], type: 'Point' },
      properties: {
        osm_type: 'N',
        osm_id: 151374347,
        country: 'United States',
        osm_key: 'place',
        osm_value: 'city',
        name: 'Paris',
        state: 'Texas',
      },
    },
    {
      geometry: { coordinates: [2.34, 48.85], type: 'Point' },
      properties: {
        osm_type: 'W',
        osm_id: 999,
        country: 'France',
        osm_key: 'highway',
        osm_value: 'residential',
        name: 'Rue de Paris',
      },
    },
  ],
};

function photonWithResponse(status: number, body: unknown): ReturnType<typeof createPhotonProvider> {
  return createPhotonProvider({
    fetchFn: (() =>
      Promise.resolve(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
      )) as typeof fetch,
  });
}

describe('photon provider', () => {
  it('dedupes place + boundary rows describing the same city', async () => {
    const doubled = {
      features: [
        {
          geometry: { coordinates: [114.1583, 22.2818], type: 'Point' },
          properties: { osm_type: 'N', osm_id: 1, name: 'Hong Kong', country: '中国', osm_key: 'place', osm_value: 'city' },
        },
        {
          geometry: { coordinates: [114.1858, 22.3492], type: 'Point' },
          properties: { osm_type: 'R', osm_id: 2, name: 'Hong Kong', country: '中国', osm_key: 'boundary', osm_value: 'administrative' },
        },
      ],
    };
    const results = await photonWithResponse(200, doubled).searchCities('hong kong');
    expect(results).toHaveLength(1);
  });

  it('parses features into candidates and filters non-places', async () => {
    const provider = photonWithResponse(200, PHOTON_FIXTURE);
    const results = await provider.searchCities('paris');
    expect(results).toHaveLength(2);
    const [fr, tx] = results as [CityCandidate, CityCandidate];
    expect(fr.name).toBe('Paris');
    expect(fr.country).toBe('France');
    expect(fr.label).toBe('Paris — Île-de-France, France');
    // extent [w, n, e, s] → bbox [s, w, n, e]
    expect(fr.bbox).toEqual([48.8155755, 2.224122, 48.902156, 2.4697602]);
    expect(tx.label).toBe('Paris — Texas, United States');
    expect(tx.bbox).toBeUndefined();
    expect(tx.lat).toBeCloseTo(33.6609389, 5);
  });

  it('turns rate limits, server errors and bad payloads into friendly errors', async () => {
    await expect(photonWithResponse(429, '{}').searchCities('x')).rejects.toThrow(/rate-limited/);
    await expect(photonWithResponse(500, '{}').searchCities('x')).rejects.toThrow(/HTTP 500/);
    await expect(photonWithResponse(200, 'not-json').searchCities('x')).rejects.toThrow(
      /unexpected response/,
    );
    const network = createPhotonProvider({
      fetchFn: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch,
    });
    await expect(network.searchCities('x')).rejects.toThrow(/unreachable/);
  });

  it('propagates aborts untouched so stale results can be ignored silently', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    const provider = createPhotonProvider({
      fetchFn: (() => Promise.reject(abortErr)) as typeof fetch,
    });
    await expect(provider.searchCities('x')).rejects.toBe(abortErr);
  });
});

describe('mock provider', () => {
  it('distinguishes same-name cities', async () => {
    const results = await createMockGeocodingProvider().searchCities('london');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.label)).toEqual([
      'London — England, United Kingdom',
      'London — Ontario, Canada',
    ]);
  });
});

describe('candidateToCityArea', () => {
  const paris: CityCandidate = {
    id: 'photon:R71525',
    name: 'Paris',
    country: 'France',
    lat: 48.8535,
    lon: 2.3484,
    bbox: [48.8156, 2.2241, 48.9022, 2.4698],
    label: 'Paris — Île-de-France, France',
    provider: 'photon',
  };

  it('clamps a whole-city extent down to a preset-sized window around the centre', () => {
    const area = candidateToCityArea(paris);
    const [s, w, n, e] = area.bbox;
    expect(n - s).toBeLessThan(0.02); // ~1.3 km, not the 9 km city extent
    expect((s + n) / 2).toBeCloseTo(paris.lat, 3);
    expect((w + e) / 2).toBeCloseTo(paris.lon, 3);
    expect(area.slug).toBe(`bbox:${area.bbox.join(',')}`);
    expect(area.name).toBe(paris.label);
  });

  it('keeps a provider extent smaller than the window', () => {
    const district: CityCandidate = {
      ...paris,
      bbox: [48.85, 2.34, 48.856, 2.352], // ~0.7 km — smaller than the window
    };
    expect(candidateToCityArea(district).bbox).toEqual([48.85, 2.34, 48.856, 2.352]);
  });

  it('scale multiplies the window (clamped to 1..3)', () => {
    const base = candidateToCityArea(paris);
    const x2 = candidateToCityArea(paris, { scale: 2 });
    const x9 = candidateToCityArea(paris, { scale: 9 }); // clamped to 3
    const latSpan = (a: { bbox: [number, number, number, number] }): number => a.bbox[2] - a.bbox[0];
    expect(latSpan(x2) / latSpan(base)).toBeCloseTo(2, 3);
    expect(latSpan(x9) / latSpan(base)).toBeCloseTo(3, 3);
    // A 3× window must still pass the URL validator.
    expect(parseBBoxSlug(x9.slug)).toEqual(x9.bbox);
  });

  it('round-trips through parseBBoxSlug', () => {
    const area = candidateToCityArea(paris);
    expect(parseBBoxSlug(area.slug)).toEqual(area.bbox);
  });
});

describe('parseBBoxSlug', () => {
  it('rejects malformed, inverted, out-of-range and oversized boxes', () => {
    expect(parseBBoxSlug('bbox:1,2,3')).toBeNull();
    expect(parseBBoxSlug('bbox:a,b,c,d')).toBeNull();
    expect(parseBBoxSlug('bbox:48.9,2.2,48.8,2.5')).toBeNull(); // south >= north
    expect(parseBBoxSlug('bbox:91,2.2,92,2.5')).toBeNull(); // out of range
    expect(parseBBoxSlug('bbox:48.0,2.0,48.9,2.5')).toBeNull(); // ~100 km tall
    expect(parseBBoxSlug('22.276,114.148,22.287,114.166')).toEqual([22.276, 114.148, 22.287, 114.166]);
  });
});
