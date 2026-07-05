import type { MapConfig } from './types';
/** Pure height function in world units; negative values are below sea level. */
export type HeightSampler = (x: number, z: number) => number;
export declare function createHeightSampler(seed: string, config: MapConfig): HeightSampler;
