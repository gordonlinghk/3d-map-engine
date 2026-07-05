import type { MapWorld, SerializedMap } from './types';
export declare function serializeMap(world: MapWorld): SerializedMap;
export declare function deserializeMap(data: SerializedMap): MapWorld;
