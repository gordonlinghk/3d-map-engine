/**
 * Bake a large real-city extract into a MapWorld JSON file, offline.
 *
 *   pnpm bake --city "Hong Kong" --size 3
 *   pnpm bake --center 22.2818,114.1583 --size 3 --name "Hong Kong 3km"
 *   pnpm bake --bbox 22.265,114.14,22.295,114.175 --name "Central+Wan Chai"
 *
 * Options:
 *   --city <query>     geocode the centre via Photon (first match)
 *   --center <lat,lon> explicit centre
 *   --bbox <s,w,n,e>   explicit box (overrides --size)
 *   --size <km>        square edge around the centre (default 3, max 8)
 *   --tile <km>        Overpass tile edge (default 1.2)
 *   --delay <ms>       pause between tile requests (default 1500)
 *   --name <name>      world display name
 *   --out <file>       output path (default baked/<slug>.map.json)
 *   --force            allow size > 8 km (be kind to the public Overpass server)
 *
 * The output loads in the demo via  ?world=<url-to-file>  (e.g. copy it to
 * packages/demo/public/cities/ and open /?world=cities/<file>), or in your
 * own app via  deserializeMap(JSON.parse(...)) + renderer.loadWorld(world).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { serializeMap } from '@map-engine/core';
import {
  createPhotonProvider,
  fetchOsmAreaTiled,
  osmToWorld,
  parseBBoxSlug,
} from '@map-engine/osm';
import type { BBox } from '@map-engine/osm';

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function boxAround(lat: number, lon: number, sizeKm: number): BBox {
  const halfLat = sizeKm / 2 / KM_PER_DEG_LAT;
  const halfLon = sizeKm / 2 / (KM_PER_DEG_LON_EQUATOR * Math.cos((lat * Math.PI) / 180));
  const r = (v: number): number => Math.round(v * 1e5) / 1e5;
  return [r(lat - halfLat), r(lon - halfLon), r(lat + halfLat), r(lon + halfLon)];
}

async function main(): Promise<void> {
  const sizeKm = Number(arg('size') ?? 3);
  if (!Number.isFinite(sizeKm) || sizeKm <= 0) fail('--size must be a positive number of km');
  if (sizeKm > 8 && !has('force')) {
    fail('--size > 8 km hammers the public Overpass server and the renderer; pass --force if you really mean it');
  }

  let bbox: BBox | null = null;
  let name = arg('name');

  if (arg('bbox')) {
    bbox = parseBBoxSlug(arg('bbox')!);
    if (!bbox) {
      // parseBBoxSlug enforces the small live-search window; re-parse leniently for baking.
      const parts = arg('bbox')!.split(',').map(Number);
      if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v)) || parts[0]! >= parts[2]! || parts[1]! >= parts[3]!) {
        fail('--bbox must be s,w,n,e in degrees');
      }
      bbox = parts as unknown as BBox;
    }
  } else if (arg('center')) {
    const [lat, lon] = arg('center')!.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) fail('--center must be lat,lon');
    bbox = boxAround(lat!, lon!, sizeKm);
  } else if (arg('city')) {
    console.log(`Geocoding "${arg('city')}" via Photon…`);
    const candidates = await createPhotonProvider().searchCities(arg('city')!, { limit: 3 });
    if (candidates.length === 0) fail(`no city found for "${arg('city')}"`);
    const pick = candidates[0]!;
    console.log(`→ ${pick.label} (${pick.lat.toFixed(4)}, ${pick.lon.toFixed(4)})`);
    if (candidates.length > 1) {
      console.log(`  (other matches: ${candidates.slice(1).map((c) => c.label).join(' · ')})`);
    }
    bbox = boxAround(pick.lat, pick.lon, sizeKm);
    name ??= `${pick.label} · ${sizeKm}km`;
  } else {
    fail('specify one of --city <query> | --center <lat,lon> | --bbox <s,w,n,e>');
  }

  name ??= `Baked area ${bbox.join(',')}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const out = arg('out') ?? `baked/${slug}.map.json`;

  console.log(`Baking bbox [${bbox.join(', ')}] (~${sizeKm}×${sizeKm} km) → ${out}`);
  const started = Date.now();
  const osm = await fetchOsmAreaTiled(bbox, {
    tileKm: Number(arg('tile') ?? 1.2),
    delayMs: Number(arg('delay') ?? 1500),
    onProgress: (p) =>
      console.log(`  tile ${p.tile}/${p.tiles} — ${p.elements.toLocaleString()} elements${p.attempt > 1 ? ` (attempt ${p.attempt})` : ''}`),
  });
  console.log(`Fetched ${osm.elements.length.toLocaleString()} unique elements in ${Math.round((Date.now() - started) / 1000)}s; converting…`);

  const world = osmToWorld(osm, { name, bbox });
  const buildings = Object.values(world.objects).filter((o) => o.objectType === 'building').length;
  const json = JSON.stringify(serializeMap(world));

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`✓ ${out}`);
  console.log(`  world id:   ${world.id}`);
  console.log(`  buildings:  ${buildings.toLocaleString()}`);
  console.log(`  road edges: ${world.roadGraph.edges.length.toLocaleString()}`);
  console.log(`  file size:  ${(json.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`\nTry it:  cp ${out} packages/demo/public/cities/ && open "http://localhost:5173/?world=cities/${out.split('/').pop()}"`);
}

void main();
