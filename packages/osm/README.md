# @map-engine/osm

OpenStreetMap adapter for [`@map-engine/core`](https://www.npmjs.com/package/@map-engine/core): fetch real city data through the Overpass API and convert it into a renderable `MapWorld`.

```ts
import { CITY_PRESETS, fetchOsmArea, osmToWorld } from '@map-engine/osm';

const city = CITY_PRESETS['tokyo-shibuya'];
const osm = await fetchOsmArea(city.bbox);
const world = osmToWorld(osm, { name: city.name, bbox: city.bbox });
await renderer.loadWorld(world); // @map-engine/three
```

Data © OpenStreetMap contributors (ODbL). Live demo & docs: https://github.com/gordonlinghk/3d-map-engine
