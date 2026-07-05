import type { HeightSampler } from './terrain';
import type { MapConfig, RoadGraph } from './types';
/**
 * Road network = downtown street grid + two highways crossing the whole map.
 * Highway segments over water become bridges. Everything is derived from the
 * height field, so the graph is deterministic for a (seed, config) pair.
 */
export declare function generateRoadGraph(_seed: string, config: MapConfig, sample: HeightSampler): RoadGraph;
