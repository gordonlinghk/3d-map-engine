# @map-engine/three

Three.js renderer adapter for [`@map-engine/core`](https://www.npmjs.com/package/@map-engine/core): terrain/building/road meshes, orbit/fly/walk cameras with collision, picking, day/golden-hour/night environments, ambient traffic, tour mode.

```ts
import { generateWorld, getPresetConfig } from '@map-engine/core';
import { createThreeMapRenderer } from '@map-engine/three';

const world = generateWorld('my-seed', getPresetConfig('coastal-tech-city'));
const renderer = createThreeMapRenderer({ container: document.getElementById('map')! });
await renderer.loadWorld(world);
renderer.on('object:selected', ({ objectId }) => console.log(world.objects[objectId]));
```

Peer dependency: `three >= 0.170`. Live demo & docs: https://github.com/gordonlinghk/3d-map-engine
