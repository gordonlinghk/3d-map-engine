import { describe, expect, it } from 'vitest';
import { fetchOsmAreaTiled, mergeOsmResponses, splitBBox } from './bake';
import type { BBox, OsmResponse } from './types';

// ~3.3 km × ~3.7 km around Hong Kong Central.
const HK: BBox = [22.265, 114.14, 22.295, 114.175];

describe('splitBBox', () => {
  it('covers the input exactly with no gaps or overlaps', () => {
    const tiles = splitBBox(HK, 1.2);
    expect(tiles.length).toBeGreaterThan(1);
    // Row-major grid: first tile starts at the south-west corner, last ends at north-east.
    expect(tiles[0]![0]).toBeCloseTo(HK[0], 10);
    expect(tiles[0]![1]).toBeCloseTo(HK[1], 10);
    expect(tiles[tiles.length - 1]![2]).toBeCloseTo(HK[2], 10);
    expect(tiles[tiles.length - 1]![3]).toBeCloseTo(HK[3], 10);
    // Total area of tiles equals the bbox area (no gaps/overlaps).
    const area = (b: BBox): number => (b[2] - b[0]) * (b[3] - b[1]);
    const sum = tiles.reduce((acc, t) => acc + area(t), 0);
    expect(sum).toBeCloseTo(area(HK), 10);
  });

  it('returns a single tile when the bbox already fits', () => {
    const small: BBox = [22.28, 114.15, 22.284, 114.155];
    expect(splitBBox(small, 1.2)).toEqual([small]);
  });
});

describe('mergeOsmResponses', () => {
  it('dedupes elements shared across tile borders', () => {
    const a: OsmResponse = {
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'way', id: 10, nodes: [1, 2] },
      ],
    };
    const b: OsmResponse = {
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 }, // shared node
        { type: 'node', id: 2, lat: 0, lon: 1 },
        { type: 'way', id: 10, nodes: [1, 2] }, // border-crossing way in both tiles
      ],
    };
    const merged = mergeOsmResponses([a, b]);
    expect(merged.elements).toHaveLength(3);
    expect(merged.elements.filter((e) => e.type === 'way')).toHaveLength(1);
  });
});

describe('fetchOsmAreaTiled', () => {
  it('fetches every tile, reports progress, merges results', async () => {
    const fetched: BBox[] = [];
    const progress: number[] = [];
    const merged = await fetchOsmAreaTiled(HK, {
      tileKm: 1.2,
      delayMs: 0,
      fetchArea: (bbox) => {
        fetched.push(bbox);
        return Promise.resolve({
          elements: [{ type: 'node', id: fetched.length, lat: bbox[0], lon: bbox[1] }],
        } as OsmResponse);
      },
      sleep: () => Promise.resolve(),
      onProgress: (p) => progress.push(p.tile),
    });
    const tiles = splitBBox(HK, 1.2);
    expect(fetched).toHaveLength(tiles.length);
    expect(progress).toEqual(tiles.map((_, i) => i + 1));
    expect(merged.elements).toHaveLength(tiles.length);
  });

  it('retries failed tiles with backoff, then succeeds', async () => {
    let calls = 0;
    const waits: number[] = [];
    const merged = await fetchOsmAreaTiled([22.28, 114.15, 22.284, 114.155], {
      delayMs: 0,
      fetchArea: () => {
        calls += 1;
        if (calls < 3) return Promise.reject(new Error('Overpass API error 429'));
        return Promise.resolve({ elements: [] });
      },
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(calls).toBe(3);
    expect(waits).toEqual([5000, 15000]); // backoff before each retry
    expect(merged.elements).toEqual([]);
  });

  it('stops between tiles when the signal aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    const promise = fetchOsmAreaTiled(HK, {
      tileKm: 1.2,
      delayMs: 0,
      signal: controller.signal,
      fetchArea: () => {
        calls += 1;
        if (calls === 2) controller.abort();
        return Promise.resolve({ elements: [] });
      },
      sleep: () => Promise.resolve(),
    });
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(2); // no tiles fetched after the abort
  });

  it('gives up after the retry budget with a tile-identifying error', async () => {
    await expect(
      fetchOsmAreaTiled([22.28, 114.15, 22.284, 114.155], {
        delayMs: 0,
        retries: 1,
        fetchArea: () => Promise.reject(new Error('boom')),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/Tile 1\/1 .* failed after 2 attempts: boom/);
  });
});
