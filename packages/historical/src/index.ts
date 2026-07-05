export { historicalToWorld, type HistoricalConvertOptions } from './convert';
export { THREE_KINGDOMS } from './data/threeKingdoms';
export type {
  Confidence,
  HistoricalCity,
  HistoricalCityKind,
  HistoricalFaction,
  HistoricalMapData,
  HistoricalRiver,
  HistoricalRoute,
  LatLon,
} from './types';

import { THREE_KINGDOMS } from './data/threeKingdoms';
import type { HistoricalMapData } from './types';

/** Registry of bundled historical maps, keyed by slug (URL ?map=<slug>). */
export const HISTORICAL_MAPS: Record<string, HistoricalMapData> = {
  [THREE_KINGDOMS.id]: THREE_KINGDOMS,
};
