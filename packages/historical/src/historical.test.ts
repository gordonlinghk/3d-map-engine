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

describe('THREE_KINGDOMS era snapshots', () => {
  const eras = THREE_KINGDOMS.eras ?? [];
  const cityIds = THREE_KINGDOMS.cities.map((c) => c.id);
  const KINDS = ['capital', 'major', 'town', 'pass', 'site'];

  it('bundles the curated eras in chronological order, with a default', () => {
    expect(eras.map((e) => e.id)).toEqual(['y194', 'y200', 'y208', 'y219', 'y229', 'y264']);
    expect(eras.map((e) => e.year)).toEqual([...eras.map((e) => e.year)].sort((a, b) => a - b));
    expect(eras.some((e) => e.id === THREE_KINGDOMS.defaultEra)).toBe(true);
  });

  for (const era of eras) {
    describe(`${era.id} ${era.name}`, () => {
      it('covers every city id exactly once, with no unknown ids', () => {
        expect(Object.keys(era.ownership).sort()).toEqual([...cityIds].sort());
      });

      it('assigns every city to a faction of this era (or neutral)', () => {
        const ids = new Set(era.factions.map((f) => f.id));
        for (const [cityId, factionId] of Object.entries(era.ownership)) {
          expect(
            factionId === 'neutral' || ids.has(factionId),
            `${era.id}/${cityId} → ${factionId}`,
          ).toBe(true);
        }
      });

      it('carries provenance and drawable faction boundaries', () => {
        expect(era.sources.length).toBeGreaterThan(0);
        expect(era.factions.length).toBeGreaterThan(0);
        const seen = new Set<string>();
        for (const f of era.factions) {
          expect(seen.has(f.id), `${era.id} duplicate faction ${f.id}`).toBe(false);
          seen.add(f.id);
          expect(f.color, `${era.id}/${f.id} color`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(f.boundary.length, `${era.id}/${f.id} boundary`).toBeGreaterThanOrEqual(3);
        }
      });

      it('overrides only reference real cities and valid kinds', () => {
        for (const [cityId, kind] of Object.entries(era.kindOverrides ?? {})) {
          expect(cityIds, `${era.id} kindOverride ${cityId}`).toContain(cityId);
          expect(KINDS).toContain(kind);
        }
        for (const [cityId, name] of Object.entries(era.nameOverrides ?? {})) {
          expect(cityIds, `${era.id} nameOverride ${cityId}`).toContain(cityId);
          expect(name.length).toBeGreaterThan(0);
        }
      });
    });
  }

  it('the default era reproduces the base cities exactly', () => {
    const base = eras.find((e) => e.id === THREE_KINGDOMS.defaultEra)!;
    const expected = Object.fromEntries(THREE_KINGDOMS.cities.map((c) => [c.id, c.factionId]));
    expect(base.ownership).toEqual(expected);
    expect(base.factions).toEqual(THREE_KINGDOMS.factions);
    expect(base.kindOverrides).toBeUndefined();
    expect(base.nameOverrides).toBeUndefined();
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

  it('tints faction districts with the faction colour (whole-map district stays untinted)', () => {
    const whole = world.districts.find((d) => d.id === 'd:hist');
    expect(whole?.color).toBeUndefined();
    for (const faction of THREE_KINGDOMS.factions) {
      const district = world.districts.find((d) => d.id === `d:${faction.id}`);
      expect(district?.color, `d:${faction.id}`).toBe(faction.color);
    }
    expect(world.districts).toHaveLength(THREE_KINGDOMS.factions.length + 1);
  });

  it('renders an era snapshot: y200 re-assigns owners, kinds, names and districts', () => {
    const y200 = THREE_KINGDOMS.eras!.find((e) => e.id === 'y200')!;
    const w = historicalToWorld(THREE_KINGDOMS, { era: 'y200' });
    expect(w.id).toBe('hist:three-kingdoms:y200');
    expect(w.seed).toBe('hist-three-kingdoms-y200');

    // Districts come from the era's factions, each carrying its colour.
    expect(w.districts.map((d) => d.id)).toEqual([
      'd:hist',
      ...y200.factions.map((f) => `d:${f.id}`),
    ]);
    for (const f of y200.factions) {
      expect(w.districts.find((d) => d.id === `d:${f.id}`)?.color).toBe(f.color);
    }
    expect(w.districts.find((d) => d.id === 'd:hist')?.color).toBeUndefined();

    // 成都 belonged to 劉璋, not 蜀漢 — and was not yet an imperial capital.
    const liuzhang = y200.factions.find((f) => f.id === 'liuzhang')!;
    const chengdu = w.objects['city:three-kingdoms:chengdu'];
    if (chengdu?.objectType !== 'building') throw new Error('missing 成都');
    expect(chengdu.building.category).toBe(liuzhang.name);
    expect(chengdu.building.districtId).toBe('d:liuzhang');
    expect(chengdu.building.tags).toContain(liuzhang.name);
    expect(chengdu.building.description.startsWith(liuzhang.name)).toBe(true);
    expect(chengdu.building.metadata?.kind).toBe('major'); // kindOverrides
    expect(chengdu.building.description).toContain('重鎮');

    // nameOverrides rename the hall and its walls.
    const jianye = w.objects['city:three-kingdoms:jianye'];
    if (jianye?.objectType !== 'building') throw new Error('missing 建業');
    expect(jianye.building.name).toBe('秣陵');
    const walls = Object.values(w.objects).filter(
      (o) => o.objectType === 'building' && o.building.name === '秣陵城牆',
    );
    expect(walls).toHaveLength(4);

    // 'neutral' ownership renders as 群雄 under the whole-map district.
    const wudu = w.objects['city:three-kingdoms:wudu'];
    if (wudu?.objectType !== 'building') throw new Error('missing 武都');
    expect(wudu.building.category).toBe('群雄');
    expect(wudu.building.districtId).toBe('d:hist');
  });

  it('other eras keep the city set and pick up their own owners', () => {
    for (const id of ['y194', 'y208', 'y219', 'y264']) {
      const era = THREE_KINGDOMS.eras!.find((e) => e.id === id)!;
      const w = historicalToWorld(THREE_KINGDOMS, { era: id });
      expect(w.id).toBe(`hist:three-kingdoms:${id}`);
      const halls = Object.values(w.objects).filter((o) => o.id.startsWith('city:'));
      expect(halls).toHaveLength(THREE_KINGDOMS.cities.length);
      for (const city of THREE_KINGDOMS.cities) {
        const obj = w.objects[`city:three-kingdoms:${city.id}`];
        if (obj?.objectType !== 'building') throw new Error(`missing ${city.id}`);
        const owner = era.ownership[city.id]!;
        const faction = era.factions.find((f) => f.id === owner);
        expect(obj.building.category, `${id}/${city.id}`).toBe(faction?.name ?? '群雄');
      }
    }
    // 219: 江陵 already lost to 孫權, 上庸 taken by 劉備.
    const w219 = historicalToWorld(THREE_KINGDOMS, { era: 'y219' });
    const category = (id: string): string | undefined => {
      const obj = w219.objects[`city:three-kingdoms:${id}`];
      return obj?.objectType === 'building' ? obj.building.category : undefined;
    };
    expect(category('jiangling')).toBe('孫權');
    expect(category('shangyong')).toBe('劉備');
    expect(category('xiangping')).toBe('公孫氏(遼東)');
  });

  it('the outer snapshots bracket the age: 成都 is 劉焉 in 194 and 曹魏 in 264', () => {
    const y194 = THREE_KINGDOMS.eras!.find((e) => e.id === 'y194')!;
    const liuyan = y194.factions.find((f) => f.id === 'liuyan')!;
    const w194 = historicalToWorld(THREE_KINGDOMS, { era: 'y194' });
    expect(w194.id).toBe('hist:three-kingdoms:y194');
    const chengdu194 = w194.objects['city:three-kingdoms:chengdu'];
    if (chengdu194?.objectType !== 'building') throw new Error('missing 成都');
    expect(chengdu194.building.category).toBe(liuyan.name);
    expect(chengdu194.building.districtId).toBe('d:liuyan');
    // 194 年洛陽已焚、河南尹無主,虎牢與官渡同列群雄。
    const hulao = w194.objects['city:three-kingdoms:hulao'];
    expect(hulao?.objectType === 'building' && hulao.building.category).toBe('群雄');

    const w264 = historicalToWorld(THREE_KINGDOMS, { era: 'y264' });
    expect(w264.id).toBe('hist:three-kingdoms:y264');
    const chengdu264 = w264.objects['city:three-kingdoms:chengdu'];
    if (chengdu264?.objectType !== 'building') throw new Error('missing 成都');
    expect(chengdu264.building.category).toBe('曹魏');
    expect(chengdu264.building.metadata?.kind).toBe('major'); // 蜀亡,成都不再是帝都
    // 羅憲固守永安,吳師不能克 —— 白帝城歸魏。
    const yongan = w264.objects['city:three-kingdoms:yongan'];
    expect(yongan?.objectType === 'building' && yongan.building.category).toBe('曹魏');
  });

  it('the default era and unknown era ids fall back to the base snapshot', () => {
    const base = JSON.stringify(serializeMap(historicalToWorld(THREE_KINGDOMS)));
    for (const era of ['y229', 'nonsense', '']) {
      const other = JSON.stringify(serializeMap(historicalToWorld(THREE_KINGDOMS, { era })));
      expect(other, `era=${era}`).toBe(base);
    }
  });

  it('works without elevation (flat fallback)', () => {
    const flat = historicalToWorld(THREE_KINGDOMS);
    const chunk = Object.values(flat.chunks)[0]!;
    expect(new Set(chunk.heights.map((h) => Math.round(h * 100))).size).toBeLessThanOrEqual(2);
  });
});
