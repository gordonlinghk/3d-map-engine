import type { MapConfig, MapPresetId } from './types';

const BASE: Omit<MapConfig, 'preset' | 'terrain' | 'city'> = {
  chunkSize: 200,
  chunksX: 8,
  chunksZ: 8,
  waterLevel: 0,
};

export const MAP_PRESETS: Record<MapPresetId, MapConfig> = {
  'coastal-tech-city': {
    ...BASE,
    preset: 'coastal-tech-city',
    terrain: { maxHeight: 60, hilliness: 0.45, islandFactor: 0.55 },
    city: { blockSize: 40, buildingDensity: 0.55, maxFloors: 40 },
  },
  'island-city': {
    ...BASE,
    preset: 'island-city',
    terrain: { maxHeight: 90, hilliness: 0.7, islandFactor: 0.85 },
    city: { blockSize: 36, buildingDensity: 0.4, maxFloors: 18 },
  },
  'downtown-night-grid': {
    ...BASE,
    preset: 'downtown-night-grid',
    terrain: { maxHeight: 25, hilliness: 0.2, islandFactor: 0.35 },
    city: { blockSize: 32, buildingDensity: 0.75, maxFloors: 55 },
  },
};

export function getPresetConfig(preset: MapPresetId): MapConfig {
  return structuredClone(MAP_PRESETS[preset]);
}
