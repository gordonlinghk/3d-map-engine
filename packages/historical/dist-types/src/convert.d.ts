import type { MapWorld } from '@map-engine/core';
import type { HistoricalMapData } from './types';
/**
 * Strategy-scale conversion: 1 world unit = 1 km (not 1 m like city maps).
 * Cities become stylized walled compounds sized for readability, terrain
 * comes from a real elevation sampler (visually exaggerated), rivers are
 * ribbon polygons carved into the terrain, and routes become the road graph
 * draped over the relief.
 */
export type HistoricalConvertOptions = {
    /** Real elevation in metres; omit for a flat world (tests/offline). */
    elevation?: (lat: number, lon: number) => number;
    /** World units per metre of elevation (0.012 → a 3,000 m range reads ~36 units). */
    verticalScale?: number;
    /** Sea threshold in metres — at/below renders as water. */
    seaLevel?: number;
};
export declare function historicalToWorld(data: HistoricalMapData, options?: HistoricalConvertOptions): MapWorld;
