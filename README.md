# 3D Map Engine

A reusable, deterministic **procedural 3D city map engine** for the web — Three.js + TypeScript, shipped as an embeddable SDK plus an interactive browser demo ("SF Tech Atlas" style: procedural coastal city, real tech-company data, day/golden-hour/night, orbit/fly/walk navigation).

**Live demo:** https://gordonlinghk.github.io/3d-map-engine/

**Docs:** [開發者技術手冊 (HTML)](https://gordonlinghk.github.io/3d-map-engine/developer-guide.html) · [AI Agent 交接文檔 (Markdown)](3d-map-engine-development-guide.md)

## Quick start

```bash
pnpm install
pnpm dev          # demo at http://localhost:5173
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # e2e + visual tests (Playwright; run `npx playwright install chromium` once)
pnpm build        # production build of the demo
```

Demo URL parameters: `?seed=<any-string>&preset=coastal-tech-city|island-city|downtown-night-grid&env=day|golden-hour|night&cfg=<base64url MapDirectives>`

### Editor mode ✏️

Toggle ✏️ in the toolbar: click a building to rename it, change floors, rotate (±15°), delete, or drag it to a new spot; use ＋ Add to place new buildings anywhere. Full undo/redo (100 steps). Edits are saved to localStorage per world and re-applied on reload; “Export world JSON” downloads the full serialized `MapWorld`. Works on procedural and OSM worlds alike.

**Drafts 💾** — “Save draft” writes a portable `.mapdraft.json` file (edits + how to rebuild the base world: procedural worlds store their seed/directives recipe, OSM worlds embed a full snapshot so upstream data drift can’t break the draft). “Open draft” restores it — on any machine, any later day — and drops you straight back into edit mode to continue. On Chromium browsers repeat saves overwrite the same file via the File System Access API; elsewhere each save downloads a fresh copy. localStorage autosave still runs alongside as a crash safety net.

### Real cities (OpenStreetMap) 🗺

**Search any city on Earth** in the 🌍 World panel: type a name (min 2 chars, debounced autocomplete via the keyless [Photon](https://photon.komoot.io) geocoder — or press 🔍/Enter), pick the right one from the disambiguated candidates (city · region · country, keyboard ↑↓ + Enter supported), and a preset-sized (~1.3×1.8 km) extract centred on it is fetched and rendered. Curated quick picks remain (`?city=tokyo-shibuya|hong-kong-central|manhattan-midtown|london-city`); searched cities are shareable via `?bbox=s,w,n,e&cityName=…`. `?geo=mock` switches to an offline candidate dataset for development. The geocoder sits behind a `GeocodingProvider` interface (`createPhotonProvider` / `createMockGeocodingProvider` in `@map-engine/osm`), so keyed providers (Mapbox, Google Places…) can be plugged in without UI changes.

Building footprints, heights, road networks, parks and water are fetched live from the Overpass API and converted into a `MapWorld` by [`@map-engine/osm`](packages/osm) — real polygon buildings are extruded into a single merged mesh with per-face picking, named buildings are searchable, and cars drive the real streets. Data © OpenStreetMap contributors (ODbL). v1 limitations: flat terrain (no elevation), no multipolygon relations, coastal sea not reconstructed.

**Bake big areas offline 🍞** — live fetching is capped at a ~1.3×1.8 km window (public-Overpass etiquette + load time). For larger areas, pre-bake a world file:

```bash
pnpm bake --city "Hong Kong" --size 3          # 3×3 km, tiled + rate-limited fetch
pnpm bake --center 22.2818,114.1583 --size 4   # or an explicit centre / --bbox s,w,n,e
```

The CLI splits the box into ~1.2 km tiles, fetches them sequentially with delays and retry/backoff, merges + dedupes, and writes a serialized `MapWorld` JSON (3×3 km Hong Kong ≈ 3,150 buildings, 7 MB, boots in ~1 s). Load it in the demo via `?world=<url>` (e.g. copy into `packages/demo/public/cities/`), or in your own app with `deserializeMap()` + `loadWorld()`. The tiled fetcher is also exported as `fetchOsmAreaTiled()` for programmatic baking. Sizes above 8 km are refused without `--force` — both the public Overpass server and a single-mesh renderer have limits; truly city-scale worlds need streaming/LOD (future work).

### Prompt-to-map ✨

Open the 🌍 World panel and describe a city in natural language (English or Chinese) — e.g. *"a mountainous island city at night with dense skyscrapers"* / *「黃昏的海灣城市,有大橋和密集高樓」*. Two modes:

- **With a Claude API key** (stored only in your browser's localStorage, sent directly to the Anthropic API): Claude translates the description into map directives via structured outputs.
- **Without a key**: a built-in keyword parser handles common descriptors offline.

Either way the result is a set of clamped `MapDirectives` (preset, environment, hilliness, density, max floors…) applied deterministically through `applyDirectives()` — shareable via the `cfg` URL parameter.

### Controls

| Input | Action |
| --- | --- |
| Left-drag | Rotate (orbit) / look (fly) |
| Scroll | Zoom (orbit) / fly speed (fly) |
| Right/middle-drag | Pan |
| WASD / arrows | Move (fly & walk) |
| Q / E | Down / up (fly) |
| Shift | Boost |
| Double-click | Fly to object or point |
| Click | Select building / landmark |
| Esc | Clear selection / exit walk pointer-lock |
| ⌘K / Ctrl-K | Focus search |

## Packages

| Package | Role | Dependencies |
| --- | --- | --- |
| `@map-engine/core` | Data model, seeded RNG, noise, terrain/road/city generation, serialization | none (no DOM, no Three.js) |
| `@map-engine/three` | Three.js renderer adapter: meshes, camera rig, picking, highlights, environments, tour | three |
| `@map-engine/ui` | React demo UI: search, list, info panel, toolbar, minimap, HUD | react, zustand, fuse.js |
| `@map-engine/demo` | Vite app wiring everything together | all of the above |

## Install (SDK)

```bash
npm install @map-engine/core @map-engine/three three
# optional React UI:
npm install @map-engine/ui   # + import '@map-engine/ui/index.css'
```

`three >= 0.170` and `react >= 18` are peer dependencies. Publishing: `pnpm release` locally, or push a `v*` tag (CI needs the `NPM_TOKEN` repo secret).

## SDK usage

```ts
import { generateWorld, getPresetConfig, serializeMap, deserializeMap } from '@map-engine/core';
import { createThreeMapRenderer, createTour } from '@map-engine/three';

// 1. Generate a deterministic world — same seed + config → identical map.
const world = generateWorld('my-seed', getPresetConfig('coastal-tech-city'));

// 2. Render it.
const renderer = createThreeMapRenderer({ container: document.getElementById('map')! });
await renderer.loadWorld(world);

// 3. Drive it.
renderer.setCameraMode('fly');                  // 'orbit' | 'fly' | 'walk'
renderer.setEnvironment('night');               // 'day' | 'golden-hour' | 'night'
renderer.setLayerVisibility('trees', false);    // terrain|water|roads|buildings|landmarks|trees
await renderer.focusObject('lm:golden-gate-bridge');
renderer.setSelected('bldg:3,-2:1,0');

// 4. React to interaction.
renderer.on('object:selected', ({ objectId }) => console.log(world.objects[objectId]));
renderer.on('object:hover', ({ objectId }) => {});
renderer.on('camera:changed', ({ position, mode }) => {});

// 5. Persist / restore.
const snapshot = serializeMap(world);           // JSON-safe
const restored = deserializeMap(JSON.parse(JSON.stringify(snapshot)));

// Optional: auto-tour of landmarks and company towers.
const tour = createTour(renderer, world);
tour.start();
```

Core guarantees:

- **Deterministic** — all generation flows through a seeded RNG with order-independent fork streams; `generateChunk` depends only on `(seed, config, coord)`.
- **Stable ids** — every interactive object has a stable `id`, `name`, `position`, `type` and metadata.
- **Serializable** — `serializeMap`/`deserializeMap` round-trips the full world through JSON.
- **Renderer-agnostic core** — `@map-engine/core` has zero DOM/Three.js/React dependencies.

## Architecture notes

- Terrain: chunked height-field meshes (8×8 chunks × 33×33 samples), per-preset shaping masks (bay carving, island falloff, downtown plateau), height-band vertex colors.
- Buildings: ~2,000 instanced boxes in 4 height classes, procedural facade textures (day) and emissive lit-window textures (night); real company metadata attached to the most prominent towers.
- Roads: merged quad-strip geometry following the exact terrain height function; highway water crossings become bridges with a constant deck height.
- Landmarks: hand-built low-poly meshes (suspension bridge with parabolic cables, TV tower, stadium, pier, island compound) resolved from terrain features.
- Picking: raycasts against instanced meshes (instanceId → building id) and landmark groups.
- Performance targets: 2,000+ buildings at interactive FPS via instancing; geometry/material/texture disposal on world reload.

## Deployment

Pushes to `main` run typecheck + lint + unit tests + Playwright e2e, then build and deploy the demo to GitHub Pages (`.github/workflows/deploy.yml`).
