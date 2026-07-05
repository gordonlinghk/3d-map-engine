# @map-engine/core

Deterministic procedural 3D city map generation: data model, seeded RNG, noise, terrain/road/city generation, serialization. Zero DOM / Three.js / React dependencies.

```ts
import { generateWorld, getPresetConfig, serializeMap } from '@map-engine/core';

const world = generateWorld('my-seed', getPresetConfig('coastal-tech-city'));
// Same seed + config → identical world, every time.
```

Renderer adapter: [`@map-engine/three`](https://www.npmjs.com/package/@map-engine/three). Live demo & docs: https://github.com/gordonlinghk/3d-map-engine
