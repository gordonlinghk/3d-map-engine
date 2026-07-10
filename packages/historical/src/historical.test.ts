import { describe, expect, it } from 'vitest';
import { serializeMap, deserializeMap } from '@map-engine/core';
import { historicalToWorld } from './convert';
import { THREE_KINGDOMS } from './data/threeKingdoms';

describe('THREE_KINGDOMS data pack', () => {
  it('is internally consistent (factions, routes, bbox, provenance)', () => {
    const factionIds = new Set(THREE_KINGDOMS.factions.map((f) => f.id));
    const cityIds = new Set(THREE_KINGDOMS.cities.map((c) => c.id));
    expect(cityIds.size).toBe(THREE_KINGDOMS.cities.length); // unique ids
    const [s, w, n, e] = THREE_KINGDOMS.bbox;
    for (const city of THREE_KINGDOMS.cities) {
      expect(factionIds.has(city.factionId), `${city.id} faction`).toBe(true);
      expect(city.position.lat).toBeGreaterThanOrEqual(s);
      expect(city.position.lat).toBeLessThanOrEqual(n);
      expect(city.position.lon).toBeGreaterThanOrEqual(w);
      expect(city.position.lon).toBeLessThanOrEqual(e);
      expect(city.sources.length, `${city.id} sources`).toBeGreaterThan(0);
      expect(['attested', 'inferred', 'stylized']).toContain(city.confidence);
    }
    for (const route of THREE_KINGDOMS.routes) {
      for (const cid of route.cities) {
        expect(cityIds.has(cid), `route ${route.id} → ${cid}`).toBe(true);
      }
    }
    // The Three Kingdoms have their three capitals.
    const capitals = THREE_KINGDOMS.cities.filter((c) => c.kind === 'capital');
    expect(capitals.map((c) => c.factionId).sort()).toEqual(['shu', 'wei', 'wu']);
  });
});

describe('historicalToWorld', () => {
  const elevation = (lat: number, lon: number): number => {
    // Synthetic China: sea east of 122°E, mountains west of 104°E, plain between.
    if (lon > 122) return -30;
    if (lon < 104) return 2000 + (104 - lon) * 300;
    return 40;
  };
  const world = historicalToWorld(THREE_KINGDOMS, { elevation });

  it('builds a strategy-scale world with cities, walls, roads and rivers', () => {
    const buildings = Object.values(world.objects).filter((o) => o.objectType === 'building');
    // Every city has a hall; walled kinds add 4 wall slabs.
    const halls = buildings.filter((b) => b.id.startsWith('city:'));
    expect(halls).toHaveLength(THREE_KINGDOMS.cities.length);
    const walls = buildings.filter((b) => b.id.startsWith('wall:'));
    const walled = THREE_KINGDOMS.cities.filter((c) => c.kind !== 'site').length;
    expect(walls).toHaveLength(walled * 4);
    // Halls and walls carry the chinese architectural style (pitched tiled roofs).
    for (const b of [...halls, ...walls]) {
      expect(b.objectType === 'building' && b.building.style).toBe('chinese');
    }
    expect(world.roadGraph.edges.length).toBeGreaterThan(30);
    expect(world.waterPolygons!.length).toBeGreaterThan(30); // river ribbons
    expect(world.id).toBe('hist:three-kingdoms');
    expect(world.attribution!.join(' ')).toContain('示意');
  });

  it('shapes terrain: sea in the east, mountains in the west, carved rivers', () => {
    let minH = Infinity;
    let maxH = -Infinity;
    for (const chunk of Object.values(world.chunks)) {
      for (const h of chunk.heights) {
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
    }
    expect(minH).toBeLessThan(0); // sea below waterLevel
    expect(maxH).toBeGreaterThan(20); // exaggerated western mountains
    expect(world.config.terrain.maxHeight).toBeGreaterThanOrEqual(maxH);
  });

  it('cities are searchable entries with faction + confidence metadata', () => {
    const chengdu = world.objects['city:three-kingdoms:chengdu'];
    expect(chengdu?.objectType).toBe('building');
    if (chengdu?.objectType === 'building') {
      expect(chengdu.building.name).toBe('成都');
      expect(chengdu.building.tags).toContain('Named');
      expect(chengdu.building.category).toBe('蜀漢');
      expect(chengdu.building.metadata?.confidence).toBe('attested');
      expect(String(chengdu.building.metadata?.sources)).toContain('三國志');
      expect(chengdu.building.description).toContain('史料明確');
    }
  });

  it('capitals stand west-to-east in the right order (成都 → 洛陽 → 建業)', () => {
    const x = (id: string): number => {
      const obj = world.objects[`city:three-kingdoms:${id}`];
      return obj?.objectType === 'building' ? obj.building.position.x : NaN;
    };
    expect(x('chengdu')).toBeLessThan(x('luoyang'));
    expect(x('luoyang')).toBeLessThan(x('jianye'));
    // North = -z: 薊(北京) is north of 番禺(廣州).
    const z = (id: string): number => {
      const obj = world.objects[`city:three-kingdoms:${id}`];
      return obj?.objectType === 'building' ? obj.building.position.z : NaN;
    };
    expect(z('ji')).toBeLessThan(z('panyu'));
  });

  it('round-trips through serialization (bake/draft compatibility)', () => {
    const restored = deserializeMap(JSON.parse(JSON.stringify(serializeMap(world))));
    expect(Object.keys(restored.objects).length).toBe(Object.keys(world.objects).length);
    expect(restored.attribution).toEqual(world.attribution);
  });

  it('works without elevation (flat fallback)', () => {
    const flat = historicalToWorld(THREE_KINGDOMS);
    const chunk = Object.values(flat.chunks)[0]!;
    expect(new Set(chunk.heights.map((h) => Math.round(h * 100))).size).toBeLessThanOrEqual(2);
  });
});
