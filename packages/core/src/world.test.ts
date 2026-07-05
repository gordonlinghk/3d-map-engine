import { describe, expect, it } from 'vitest';
import { generateWorld, generateChunk, CHUNK_RESOLUTION } from './world';
import { getPresetConfig } from './presets';
import { serializeMap, deserializeMap } from './serialize';
import { chunkKey } from './types';

describe('generateWorld', () => {
  it('same seed + config produces the identical world', () => {
    const config = getPresetConfig('coastal-tech-city');
    const a = generateWorld('alpha', config);
    const b = generateWorld('alpha', config);
    expect(a).toEqual(b);
  });

  it('different seeds produce different terrain', () => {
    const config = getPresetConfig('coastal-tech-city');
    const a = generateWorld('alpha', config);
    const b = generateWorld('beta', config);
    // Compare a central chunk — far corners are open ocean with clamped
    // depth, which is legitimately identical across seeds.
    expect(a.chunks[chunkKey({ cx: 4, cz: 4 })]!.heights).not.toEqual(
      b.chunks[chunkKey({ cx: 4, cz: 4 })]!.heights,
    );
  });

  it('chunk generation is order-independent', () => {
    const config = getPresetConfig('island-city');
    const world = generateWorld('gamma', config);
    // Regenerate two chunks in reverse order — heights must match the world.
    const late = generateChunk(world, { cx: 7, cz: 7 });
    const early = generateChunk(world, { cx: 0, cz: 0 });
    expect(late.heights).toEqual(world.chunks[chunkKey({ cx: 7, cz: 7 })]!.heights);
    expect(early.heights).toEqual(world.chunks[chunkKey({ cx: 0, cz: 0 })]!.heights);
  });

  it('produces the configured number of chunks with full height grids', () => {
    const config = getPresetConfig('downtown-night-grid');
    const world = generateWorld('delta', config);
    expect(Object.keys(world.chunks)).toHaveLength(config.chunksX * config.chunksZ);
    for (const chunk of Object.values(world.chunks)) {
      expect(chunk.heights).toHaveLength((CHUNK_RESOLUTION + 1) ** 2);
      expect(chunk.heights.every((h) => Number.isFinite(h))).toBe(true);
    }
  });

  it('every preset contains both land and water', () => {
    for (const preset of ['coastal-tech-city', 'island-city', 'downtown-night-grid'] as const) {
      const config = getPresetConfig(preset);
      const world = generateWorld('terrain-check', config);
      const all = Object.values(world.chunks).flatMap((c) => c.heights);
      const landRatio = all.filter((h) => h > config.waterLevel).length / all.length;
      expect(landRatio, `${preset} land ratio`).toBeGreaterThan(0.15);
      expect(landRatio, `${preset} land ratio`).toBeLessThan(0.95);
    }
  });

  it('generates a road graph with streets, highways and valid endpoints', () => {
    const config = getPresetConfig('coastal-tech-city');
    const world = generateWorld('roads', config);
    expect(world.roadGraph.edges.length).toBeGreaterThan(50);
    const kinds = new Set(world.roadGraph.edges.map((e) => e.kind));
    expect(kinds.has('street')).toBe(true);
    expect(kinds.has('highway')).toBe(true);
    const nodeIds = new Set(world.roadGraph.nodes.map((n) => n.id));
    for (const edge of world.roadGraph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  it('worlds survive serialization round-trip', () => {
    const config = getPresetConfig('island-city');
    const world = generateWorld('roundtrip', config);
    const restored = deserializeMap(JSON.parse(JSON.stringify(serializeMap(world))));
    expect(restored).toEqual(world);
  });
});
