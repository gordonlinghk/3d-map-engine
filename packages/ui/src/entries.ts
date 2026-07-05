import type { MapWorld } from '@map-engine/core';

export type AtlasEntry = {
  id: string;
  name: string;
  kind: 'company' | 'landmark' | 'district' | 'building';
  category?: string;
  badge?: string;
  description: string;
  tags: string[];
  unicorn: boolean;
};

/** Searchable / listable entries: named buildings, landmarks and districts. */
export function buildAtlasEntries(world: MapWorld): AtlasEntry[] {
  const entries: AtlasEntry[] = [];

  for (const obj of Object.values(world.objects)) {
    if (obj.objectType !== 'building') continue;
    const b = obj.building;
    if (b.metadata?.company !== undefined) {
      const valuation = String(b.metadata.valuation ?? '');
      entries.push({
        id: b.id,
        name: b.name,
        kind: 'company',
        category: b.category,
        badge: valuation === 'Public' ? 'IPO' : valuation,
        description: b.description,
        tags: b.tags,
        unicorn: b.tags.includes('Unicorn'),
      });
    } else if (b.type === 'public') {
      entries.push({
        id: b.id,
        name: b.name,
        kind: 'building',
        category: 'Public',
        description: b.description,
        tags: b.tags,
        unicorn: false,
      });
    }
  }

  for (const lm of world.landmarks) {
    entries.push({
      id: lm.id,
      name: lm.name,
      kind: 'landmark',
      category: 'Landmark',
      description: lm.description,
      tags: lm.tags,
      unicorn: false,
    });
  }

  for (const d of world.districts) {
    entries.push({
      id: d.id,
      name: d.name,
      kind: 'district',
      category: 'Neighborhood',
      description: `${d.name} district`,
      tags: [d.kind],
      unicorn: false,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

export const CATEGORY_CHIPS = [
  'All',
  'AI',
  'DevTools',
  'Fintech',
  'Design',
  'Consumer',
  'Enterprise',
  'Infra',
  'Landmarks',
  'Unicorns',
] as const;

export type CategoryChip = (typeof CATEGORY_CHIPS)[number];

export function filterEntries(entries: AtlasEntry[], chip: CategoryChip): AtlasEntry[] {
  switch (chip) {
    case 'All':
      return entries.filter((e) => e.kind === 'company' || e.kind === 'landmark');
    case 'Landmarks':
      return entries.filter((e) => e.kind === 'landmark');
    case 'Unicorns':
      return entries.filter((e) => e.unicorn);
    default:
      return entries.filter((e) => e.category === chip);
  }
}
