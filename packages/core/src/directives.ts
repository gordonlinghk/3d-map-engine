import { getPresetConfig } from './presets';
import type { MapConfig, MapPresetId } from './types';

/**
 * Prompt-to-map: a natural-language description is translated (by an LLM or
 * the local keyword parser below) into a small set of MapDirectives, which
 * deterministically map onto a MapConfig. The directive layer keeps the LLM
 * away from raw config internals and lets us clamp everything to safe ranges.
 */

export type EnvironmentDirective = 'day' | 'golden-hour' | 'night';

export type MapDirectives = {
  preset?: MapPresetId;
  environment?: EnvironmentDirective;
  seed?: string;
  /** 0..1 — how hilly the terrain is. */
  hilliness?: number;
  /** World units, ~10..120 — max terrain height. */
  maxHeight?: number;
  /** 0..1 — how much of the map is ocean. */
  islandFactor?: number;
  /** 0.1..0.95 — building fill density. */
  buildingDensity?: number;
  /** 4..70 — tallest buildings in floors. */
  maxFloors?: number;
};

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Apply directives onto a preset base config, clamping every value. */
export function applyDirectives(directives: MapDirectives): {
  config: MapConfig;
  environment: EnvironmentDirective;
  seed?: string;
} {
  const preset: MapPresetId = directives.preset ?? 'coastal-tech-city';
  const config = getPresetConfig(preset);

  if (directives.hilliness !== undefined) {
    config.terrain.hilliness = clamp(directives.hilliness, 0, 1);
  }
  if (directives.maxHeight !== undefined) {
    config.terrain.maxHeight = clamp(directives.maxHeight, 10, 120);
  }
  if (directives.islandFactor !== undefined) {
    config.terrain.islandFactor = clamp(directives.islandFactor, 0.1, 0.95);
  }
  if (directives.buildingDensity !== undefined) {
    config.city.buildingDensity = clamp(directives.buildingDensity, 0.1, 0.95);
  }
  if (directives.maxFloors !== undefined) {
    config.city.maxFloors = Math.round(clamp(directives.maxFloors, 4, 70));
  }

  return {
    config,
    environment: directives.environment ?? 'day',
    seed: directives.seed,
  };
}

/** JSON schema handed to the LLM as the structured-output format. */
export const MAP_DIRECTIVES_JSON_SCHEMA = {
  type: 'object',
  description: 'Directives for generating a procedural 3D city map.',
  properties: {
    preset: {
      type: 'string',
      enum: ['coastal-tech-city', 'island-city', 'downtown-night-grid'],
      description:
        'Base map layout. coastal-tech-city: mainland with a bay, bridge and islands (SF-like). island-city: one main island with satellites. downtown-night-grid: flat dense street grid.',
    },
    environment: {
      type: 'string',
      enum: ['day', 'golden-hour', 'night'],
      description: 'Lighting mood.',
    },
    seed: {
      type: 'string',
      description: 'Optional short seed string; derive from the theme of the prompt.',
    },
    hilliness: {
      type: 'number',
      description: 'How hilly the terrain is, 0 (flat) to 1 (mountainous).',
    },
    maxHeight: {
      type: 'number',
      description: 'Max terrain height in meters, 10 (flat plains) to 120 (steep mountains).',
    },
    islandFactor: {
      type: 'number',
      description: 'How much of the map is ocean, 0.1 (mostly land) to 0.95 (mostly water).',
    },
    buildingDensity: {
      type: 'number',
      description: 'Building fill density per block, 0.1 (sparse) to 0.95 (packed).',
    },
    maxFloors: {
      type: 'number',
      description: 'Tallest buildings in floors, 4 (low-rise town) to 70 (mega skyline).',
    },
  },
  additionalProperties: false,
} as const;

/**
 * Offline fallback: keyword-based prompt parsing (English + Chinese) so the
 * feature works without an API key.
 */
export function parsePromptLocally(prompt: string): MapDirectives {
  const p = prompt.toLowerCase();
  const d: MapDirectives = {};
  const has = (...words: string[]) => words.some((w) => p.includes(w));

  // Preset
  if (has('island', '島', '岛')) d.preset = 'island-city';
  else if (has('coastal', 'coast', 'bay', 'bridge', '海灣', '海湾', '沿海', '橋', '桥', '灣區', '湾区'))
    d.preset = 'coastal-tech-city';
  else if (has('downtown', 'grid', 'metropolis', '市中心', '格網', '格网', '都會', '都会'))
    d.preset = 'downtown-night-grid';

  // Environment
  if (has('night', 'midnight', '夜', '晚上')) d.environment = 'night';
  else if (has('sunset', 'dusk', 'golden', 'sunrise', '黃昏', '黄昏', '夕陽', '夕阳', '日落'))
    d.environment = 'golden-hour';
  else if (has('day', 'noon', 'sunny', '白天', '日間', '日间', '晴')) d.environment = 'day';

  // Terrain
  if (has('mountain', 'hilly', 'steep', '山', '丘陵')) {
    d.hilliness = 0.85;
    d.maxHeight = 95;
  } else if (has('flat', 'plain', '平坦', '平原')) {
    d.hilliness = 0.15;
    d.maxHeight = 22;
  }
  if (has('archipelago', 'many islands', 'ocean', '群島', '群岛', '海洋')) d.islandFactor = 0.9;

  // City
  if (has('dense', 'crowded', 'packed', '密集', '擁擠', '拥挤')) d.buildingDensity = 0.88;
  else if (has('sparse', 'quiet', 'village', 'town', '稀疏', '小鎮', '小镇', '村')) {
    d.buildingDensity = 0.35;
  }
  if (has('skyscraper', 'tall', 'towers', 'mega', '摩天', '高樓', '高楼')) d.maxFloors = 62;
  else if (has('low-rise', 'low rise', 'suburb', '低層', '低层', '郊區', '郊区')) d.maxFloors = 8;

  return d;
}
