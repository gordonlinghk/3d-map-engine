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
export declare function buildAtlasEntries(world: MapWorld): AtlasEntry[];
export declare const CATEGORY_CHIPS: readonly ["All", "AI", "DevTools", "Fintech", "Design", "Consumer", "Enterprise", "Infra", "Landmarks", "Unicorns"];
export type CategoryChip = (typeof CATEGORY_CHIPS)[number];
export declare function filterEntries(entries: AtlasEntry[], chip: CategoryChip): AtlasEntry[];
