import type { MapConfig, MapPresetId } from './types';
export declare const MAP_PRESETS: Record<MapPresetId, MapConfig>;
export declare function getPresetConfig(preset: MapPresetId): MapConfig;
