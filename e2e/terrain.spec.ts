import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

/**
 * Real elevation for imported cities: terrarium tiles are mocked with a
 * fixture that ramps 0 m (sea, west edge) → ~160 m, so the loaded world must
 * gain relief, settle buildings onto it, and show the terrain attribution.
 */

const OVERPASS_FIXTURE = {
  elements: [
    { type: 'node', id: 1, lat: 35.6591, lon: 139.7007 },
    { type: 'node', id: 2, lat: 35.6591, lon: 139.7012 },
    { type: 'node', id: 3, lat: 35.6595, lon: 139.7012 },
    { type: 'node', id: 4, lat: 35.6595, lon: 139.7007 },
    {
      type: 'way',
      id: 100,
      nodes: [1, 2, 3, 4, 1],
      tags: { building: 'office', name: 'Mock Tower', height: '60' },
    },
  ],
};

const HILL_PNG = readFileSync(fileURLToPath(new URL('./fixtures/terrarium-hill.png', import.meta.url)));

async function loadCity(page: Page, extraParams = ''): Promise<void> {
  await page.route('**/overpass-api.de/**', (route) =>
    route.fulfill({ json: OVERPASS_FIXTURE, contentType: 'application/json' }),
  );
  await page.route('**/elevation-tiles-prod/**', (route) =>
    route.fulfill({ body: HILL_PNG, contentType: 'image/png' }),
  );
  await page.goto(`/?city=tokyo-shibuya${extraParams}`);
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.id?.startsWith('osm:'),
    undefined,
    { timeout: 30_000 },
  );
}

function worldStats(page: Page): Promise<{
  minH: number;
  maxH: number;
  buildingY: number;
  attribution: string[];
}> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    let minH = Infinity;
    let maxH = -Infinity;
    for (const chunk of Object.values(world.chunks) as Array<{ heights: number[] }>) {
      for (const h of chunk.heights) {
        minH = Math.min(minH, h);
        maxH = Math.max(maxH, h);
      }
    }
    const b = world.objects['bldg:osm:100'];
    return { minH, maxH, buildingY: b.building.position.y, attribution: world.attribution ?? [] };
  });
}

test('imported city gains real relief from terrarium tiles', async ({ page }) => {
  await loadCity(page);
  const stats = await worldStats(page);
  // The fixture ramps ~160 m across each tile — the world must not be flat.
  expect(stats.maxH - stats.minH).toBeGreaterThan(30);
  // Building settled onto the hillside, not left at the flat OSM_GROUND=2.
  expect(Math.abs(stats.buildingY - 2)).toBeGreaterThan(1);
  expect(stats.attribution.join(' ')).toMatch(/[Tt]errain/);

  // Attribution reaches the side panel footer.
  if (await page.getByTestId('side-open').isVisible()) {
    await page.getByTestId('side-open').click();
  }
  await expect(page.getByTestId('side-panel')).toContainText('Terrain');
});

test('?flat=1 opts out and keeps the legacy flat ground', async ({ page }) => {
  await loadCity(page, '&flat=1');
  const stats = await worldStats(page);
  expect(stats.maxH - stats.minH).toBeLessThan(0.01);
  expect(stats.buildingY).toBe(2);
  expect(stats.attribution).toHaveLength(0);
});

test('terrain fetch failure falls back to flat ground, world still loads', async ({ page }) => {
  await page.route('**/overpass-api.de/**', (route) =>
    route.fulfill({ json: OVERPASS_FIXTURE, contentType: 'application/json' }),
  );
  await page.route('**/elevation-tiles-prod/**', (route) => route.abort());
  await page.goto('/?city=tokyo-shibuya');
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.id?.startsWith('osm:'),
    undefined,
    { timeout: 30_000 },
  );
  const flat = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    const chunk = Object.values(world.chunks)[0] as { heights: number[] };
    return chunk.heights.every((h) => h === 2);
  });
  expect(flat).toBe(true);
});
