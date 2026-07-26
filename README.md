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

Toggle ✏️ in the toolbar: click a building to rename it, change floors, rotate (±15°), delete, or drag it to a new spot; use ＋ Add to place new buildings anywhere. **📍 POI** places named annotation pins (quest/resource/danger/note icons, optional description) — they're searchable, selectable, listed in the side panel, toggleable via the `pois` layer, and persist through autosave/drafts like every other edit. Full undo/redo (100 steps). Edits are saved to localStorage per world and re-applied on reload; “Export world JSON” downloads the full serialized `MapWorld`. Works on procedural and OSM worlds alike.

**Drafts 💾** — “Save draft” writes a portable `.mapdraft.json` file (edits + how to rebuild the base world: procedural worlds store their seed/directives recipe, OSM worlds embed a full snapshot so upstream data drift can’t break the draft). “Open draft” restores it — on any machine, any later day — and drops you straight back into edit mode to continue. On Chromium browsers repeat saves overwrite the same file via the File System Access API; elsewhere each save downloads a fresh copy. localStorage autosave still runs alongside as a crash safety net.

### Real cities (OpenStreetMap) 🗺

**Search any city on Earth** in the 🌍 World panel: type a name (min 2 chars, debounced autocomplete via the keyless [Photon](https://photon.komoot.io) geocoder — or press 🔍/Enter), pick the right one from the disambiguated candidates (city · region · country, keyboard ↑↓ + Enter supported), and an extract centred on it is fetched and rendered. The **AREA selector** chooses the window size — 1× (~1.3 km, fast), 2× (~2.6 km, ~30 s) or 3× (~4 km, 1–2 min); larger areas fetch as sequential Overpass tiles with live progress (2× Paris ≈ 10,000 buildings). Curated quick picks remain (`?city=tokyo-shibuya|hong-kong-central|manhattan-midtown|london-city`); searched cities are shareable via `?bbox=s,w,n,e&cityName=…`. `?geo=mock` switches to an offline candidate dataset for development. The geocoder sits behind a `GeocodingProvider` interface (`createPhotonProvider` / `createMockGeocodingProvider` in `@map-engine/osm`), so keyed providers (Mapbox, Google Places…) can be plugged in without UI changes.

Building footprints, heights, road networks, parks and water are fetched live from the Overpass API and converted into a `MapWorld` by [`@map-engine/osm`](packages/osm) — real polygon buildings are extruded into a single merged mesh with per-face picking, named buildings are searchable, and cars drive the real streets. Data © OpenStreetMap contributors (ODbL).

**Real elevation ⛰** — imported cities get true relief from [`@map-engine/terrain`](packages/terrain): terrarium DEM tiles (Mapzen/Tilezen on AWS Open Data — free, keyless) are decoded into the chunk height grids, buildings settle onto the hillsides, roads and traffic follow the slopes, lakes/rivers get a flat carved bed, and sea-level cells render as actual water — Hong Kong now rises 480 m to the Peak with Victoria Harbour around it. On by default for real-city loads and `pnpm bake`; opt out with `?flat=1` / `--flat`. Remaining limitations: no multipolygon relations.

**Bake big areas offline 🍞** — live fetching is capped at a ~1.3×1.8 km window (public-Overpass etiquette + load time). For larger areas, pre-bake a world file:

```bash
pnpm bake --city "Hong Kong" --size 3          # 3×3 km, tiled + rate-limited fetch
pnpm bake --center 22.2818,114.1583 --size 4   # or an explicit centre / --bbox s,w,n,e
```

The CLI splits the box into ~1.2 km tiles, fetches them sequentially with delays and retry/backoff, merges + dedupes, and writes a serialized `MapWorld` JSON (3×3 km Hong Kong ≈ 3,150 buildings, 7 MB, boots in ~1 s). Load it in the demo via `?world=<url>` (e.g. copy into `packages/demo/public/cities/`), or in your own app with `deserializeMap()` + `loadWorld()`. The tiled fetcher is also exported as `fetchOsmAreaTiled()` for programmatic baking. Sizes above 8 km are refused without `--force` — both the public Overpass server and a single-mesh renderer have limits; truly city-scale worlds need streaming/LOD (future work).

### Historical maps ⚔️

Pick **三國時代 · 中國** in the 🌍 World panel (or `?map=three-kingdoms`) for a strategy-scale (1 unit = 1 km) map of Three-Kingdoms-era China: ~50 hand-curated walled cities (魏/蜀/吳, searchable by their period names, each carrying sources and a confidence level — 史料明確/合理推定/示意), major rivers with period-corrected courses (the Yellow River takes its ancient northern outlet), historic routes like the 蜀道 draped over **real, exaggerated terrain** from the elevation provider. Borders and routes are deliberately stylized — the map is a grounded dramatization, not an academic reconstruction (see `map-data-sources-research.md`). The data pack lives in [`@map-engine/historical`](packages/historical) as typed, reviewable TypeScript. City halls and walls render in a **Chinese architectural style** — timber-red walls under overhanging grey-tile hip roofs with curved, upturned corner eaves (翹角飛簷), a timber bracket-set band under every eave (斗栱帶), rectangular halls showing a proper hip ridge (歇山脊) instead of a square roof's degenerate peak, and imperial capitals' halls doubling up a second, smaller eave (重檐) — via the `BuildingStyle` field (`style: 'chinese'`) on `BuildingInfo`, which any world can opt into.

**Faction territory tint 🎨** — districts carry an optional `color`; `@map-engine/three` blends nearby above-water terrain toward the color of whichever faction district contains it (overlaps resolve smallest-district-first, so enclaves render in their own color), giving the map an at-a-glance strategic-coloring look. Purely additive: worlds that never set `District.color` (procedural, OSM) render exactly as before.

**Era switching 📅** — the map now carries 6 hand-compiled era snapshots, picked via the Toolbar's 📅 ERA selector or `?era=y194|y200|y208|y219|y229|y264`: **y194** 群雄並起 (14 factions), **y200** 官渡之戰 (9 factions), **y208** 赤壁前夕 (8 factions), **y219** 襄樊之戰後 (4 factions), **y229** 三國鼎立 (default, = the base map), **y264** 蜀漢既亡 (2 factions). Switching era re-owns, renames and resizes city halls to that year's recorded ownership — an original compilation from 正史, every era carrying its own sources. Selecting the default era clears `?era` from the URL; drafts saved mid-era embed the era in their `sourceSlug` and restore it on reopen.

### Prompt-to-map ✨

Open the 🌍 World panel and describe a city in natural language (English or Chinese) — e.g. *"a mountainous island city at night with dense skyscrapers"* / *「黃昏的海灣城市,有大橋和密集高樓」*. Two modes:

- **With a Claude API key** (stored only in your browser's localStorage, sent directly to the Anthropic API): Claude translates the description into map directives via structured outputs.
- **Without a key**: a built-in keyword parser handles common descriptors offline.

Either way the result is a set of clamped `MapDirectives` (preset, environment, hilliness, density, max floors…) applied deterministically through `applyDirectives()` — shareable via the `cfg` URL parameter.

### Game layer 🎮

The [`@map-engine/game`](packages/game) package turns a `MapWorld` into a playable substrate — the foundation for building an actual game on the engine. It is pure, deterministic, zero-dependency TypeScript (no DOM/Three.js): **A\* pathfinding** over the road graph (optimal, deterministic routes; an optional `edgeCost` hook re-weights or closes off edges — clamped to keep the Euclidean heuristic admissible, so A\* stays optimal), **units** that move along those routes hugging the terrain and can belong to a **faction** and fight (deterministic three-phase combat tick — engage, move-or-hold, damage — emitting `unit:combat`/`unit:defeated`), and an **event-driven simulation** (`unit:spawned` / `waypoint` / `arrived` / `combat` / `defeated` / `removed`). The Three.js binding `createGameView` (in `@map-engine/three`) renders a marker per unit (optionally colored per faction), offers **camera-follow**, and supports **click-to-select** (`pickUnit`/`selectUnit`, a ring highlights the selection).

Try it in the demo with **`?game=1`**: two factions — red × 3, blue × 3 — spawn well-separated on the road network. Click a unit to select it (a ring appears), then click the ground to send that unit pathfinding there; the camera can follow a unit; red and blue units auto-fight on contact. Everything is gated behind that flag, so the default demo is untouched.

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
| Click minimap | Jump the camera there |
| Type in the list's filter box | Narrow the side-panel list live |
| Esc | Clear selection / exit walk pointer-lock |
| ⌘K / Ctrl-K | Focus search |

## Packages

| Package | Role | Dependencies |
| --- | --- | --- |
| `@map-engine/core` | Data model, seeded RNG, noise, terrain/road/city generation, serialization | none (no DOM, no Three.js) |
| `@map-engine/terrain` | Real-world elevation: terrarium DEM tiles (AWS) → chunk height grids | core |
| `@map-engine/historical` | Hand-curated historical map packs (Three Kingdoms China) with provenance/confidence | core |
| `@map-engine/game` | Game logic: A\* pathfinding over the road graph (optional weighted/impassable edges), deterministic unit movement, faction combat, event-driven simulation | core (no DOM/Three.js) |
| `@map-engine/three` | Three.js renderer adapter: meshes, camera rig, picking, highlights, environments, tour, unit view + camera follow | three, game |
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

### Game layer

```ts
import { createGameSimulation, nearestNode } from '@map-engine/game';
import { createGameView } from '@map-engine/three';

// Pure logic — testable without a renderer.
const sim = createGameSimulation(world);
const start = nearestNode(sim.index, 0, 0)!;
const unit = sim.spawnUnit({ atNode: start, speed: 30, kind: 'soldier' });
sim.on((e) => e.type === 'unit:arrived' && console.log(`${e.unitId} arrived`));
sim.moveUnitTo(unit.id, { x: 400, y: -200 }); // Vec2: .x = world x, .y = world z

// Three binding: renders + ticks the sim each frame, and drives camera-follow.
const view = createGameView(renderer, sim);
view.followUnit(unit.id);   // camera chases the unit; followUnit(null) to stop
// view.dispose();          // detach + free everything
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
