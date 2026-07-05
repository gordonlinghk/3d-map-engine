import type { MapWorld, SerializedMap } from './types';
import { SERIALIZATION_VERSION } from './types';

export function serializeMap(world: MapWorld): SerializedMap {
  return {
    version: SERIALIZATION_VERSION,
    // Deep clone so later mutations of the live world don't leak into the
    // serialized snapshot (and vice versa).
    world: structuredClone(world),
  };
}

export function deserializeMap(data: SerializedMap): MapWorld {
  if (data.version !== SERIALIZATION_VERSION) {
    throw new Error(
      `Unsupported map serialization version ${String(data.version)}; expected ${SERIALIZATION_VERSION}`,
    );
  }
  return structuredClone(data.world);
}
