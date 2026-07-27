import { describe, expect, it } from 'vitest';
import { historicalToWorld, THREE_KINGDOMS } from '@map-engine/historical';
import { JINGZHOU_219, scenarioBuildingId, scenarioCityIds } from './scenario';

describe('JINGZHOU_219 scenario', () => {
  const cityIds = scenarioCityIds(JINGZHOU_219);
  const datasetCityIds = new Set(THREE_KINGDOMS.cities.map((c) => c.id));

  it('every scenario city exists in the dataset', () => {
    expect(cityIds.length).toBeGreaterThan(0);
    for (const id of cityIds) {
      expect(datasetCityIds.has(id), `${id} not in THREE_KINGDOMS.cities`).toBe(true);
    }
  });

  it('every scenario city resolves to a world building', () => {
    // No-network pattern: omit `elevation` so historicalToWorld falls back to
    // a flat plain, matching historical.test.ts's offline convention.
    const world = historicalToWorld(THREE_KINGDOMS, { era: 'y219' });
    for (const id of cityIds) {
      const buildingId = scenarioBuildingId(JINGZHOU_219, id);
      expect(world.objects[buildingId], buildingId).toBeDefined();
    }
  });

  it('faction city sets are disjoint and total exactly 8', () => {
    const seen = new Set<string>();
    let total = 0;
    for (const faction of JINGZHOU_219.factions) {
      for (const id of faction.cities) {
        expect(seen.has(id), `${id} claimed by more than one faction`).toBe(false);
        seen.add(id);
        total += 1;
      }
    }
    expect(total).toBe(8);
    expect(seen.size).toBe(8);
  });

  it('faction ids and colors match the dataset', () => {
    const y219 = THREE_KINGDOMS.eras?.find((e) => e.id === 'y219');
    expect(y219).toBeDefined();
    for (const faction of JINGZHOU_219.factions) {
      const datasetFaction =
        y219?.factions.find((f) => f.id === faction.id) ??
        THREE_KINGDOMS.factions.find((f) => f.id === faction.id);
      expect(datasetFaction, `${faction.id} not found in y219 era or base factions`).toBeDefined();
      expect(faction.color).toBe(datasetFaction?.color);
    }
  });

  it('recommendedEra exists in THREE_KINGDOMS.eras', () => {
    const eraIds = (THREE_KINGDOMS.eras ?? []).map((e) => e.id);
    expect(eraIds).toContain(JINGZHOU_219.recommendedEra);
  });

  it('scenarioBuildingId produces city:three-kingdoms:xiangyang for xiangyang', () => {
    expect(scenarioBuildingId(JINGZHOU_219, 'xiangyang')).toBe('city:three-kingdoms:xiangyang');
  });
});
