import { test, expect } from '@playwright/test';

/** Tiny Overpass fixture: two buildings + one road, near bbox center. */
const FIXTURE = {
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
    { type: 'node', id: 5, lat: 35.658, lon: 139.7 },
    { type: 'node', id: 6, lat: 35.658, lon: 139.7005 },
    { type: 'node', id: 7, lat: 35.6584, lon: 139.7005 },
    { type: 'node', id: 8, lat: 35.6584, lon: 139.7 },
    {
      type: 'way',
      id: 101,
      nodes: [5, 6, 7, 8, 5],
      tags: { building: 'apartments', 'building:levels': '4' },
    },
    { type: 'node', id: 20, lat: 35.657, lon: 139.698 },
    { type: 'node', id: 21, lat: 35.66, lon: 139.703 },
    { type: 'way', id: 200, nodes: [20, 21], tags: { highway: 'primary' } },
  ],
};

test('OSM city loads via mocked Overpass and is searchable', async ({ page }) => {
  await page.route('**/overpass-api.de/**', (route) =>
    route.fulfill({ json: FIXTURE, contentType: 'application/json' }),
  );

  await page.goto('/?city=tokyo-shibuya');
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eng = (window as any).__mapEngine;
      return !!eng?.world?.id?.startsWith('osm:');
    },
    undefined,
    { timeout: 30_000 },
  );

  const stats = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    const objs = Object.values(world.objects) as Array<{ objectType: string }>;
    return {
      id: world.id,
      buildings: objs.filter((o) => o.objectType === 'building').length,
      roads: world.roadGraph.edges.length,
    };
  });
  expect(stats.id).toBe('osm:Tokyo Shibuya');
  expect(stats.buildings).toBe(2);
  expect(stats.roads).toBe(1);

  // The named building is searchable and selectable.
  const input = page.locator('.atlas-search input');
  await input.click();
  await input.fill('Mock Tower');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await page.getByTestId('search-results').getByText('Mock Tower').first().click();
  await expect(page.getByTestId('info-panel')).toContainText('Mock Tower');

  // OSM attribution is shown (open the collapsed panel on mobile first).
  if (await page.getByTestId('side-open').isVisible()) {
    await page.getByTestId('side-open').click();
  }
  await expect(page.getByTestId('side-panel')).toContainText('OpenStreetMap');
});
