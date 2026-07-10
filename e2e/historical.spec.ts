import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const HILL_PNG = readFileSync(fileURLToPath(new URL('./fixtures/terrarium-hill.png', import.meta.url)));

test('three kingdoms map loads with cities, factions and disclaimer', async ({ page }) => {
  await page.route('**/elevation-tiles-prod/**', (route) =>
    route.fulfill({ body: HILL_PNG, contentType: 'image/png' }),
  );
  await page.goto('/?map=three-kingdoms');
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.id === 'hist:three-kingdoms',
    undefined,
    { timeout: 30_000 },
  );

  const stats = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objs = Object.values(world.objects) as any[];
    const chengdu = world.objects['city:three-kingdoms:chengdu'];
    return {
      cities: objs.filter((o) => o.id.startsWith('city:')).length,
      walls: objs.filter((o) => o.id.startsWith('wall:')).length,
      rivers: (world.waterPolygons ?? []).length,
      roads: world.roadGraph.edges.length,
      chengduFaction: chengdu?.building?.category,
      attribution: (world.attribution ?? []).join(' '),
    };
  });
  expect(stats.cities).toBeGreaterThan(40);
  expect(stats.walls).toBeGreaterThan(150);
  expect(stats.rivers).toBeGreaterThan(30);
  expect(stats.roads).toBeGreaterThan(30);
  expect(stats.chengduFaction).toBe('蜀漢');
  expect(stats.attribution).toContain('示意');

  // Cities are searchable by their period names.
  const input = page.locator('.atlas-search input');
  await input.click();
  await input.fill('成都');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await page.getByTestId('search-results').getByText('成都').first().click();
  await expect(page.getByTestId('info-panel')).toContainText('成都');
  await expect(page.getByTestId('info-panel')).toContainText('蜀漢');

  // The disclaimer reaches the side panel footer.
  if (await page.getByTestId('side-open').isVisible()) {
    await page.getByTestId('side-open').click();
  }
  await expect(page.getByTestId('side-panel')).toContainText('示意');
});

test('three kingdoms halls render the chinese building style (warm walls + roofs)', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.route('**/elevation-tiles-prod/**', (route) =>
    route.fulfill({ body: HILL_PNG, contentType: 'image/png' }),
  );
  await page.goto('/?map=three-kingdoms');
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.id === 'hist:three-kingdoms',
    undefined,
    { timeout: 30_000 },
  );

  const { chengduStyle, roofMeshFound, roofMapsToHall } = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engine = (window as any).__mapEngine;
    const chengdu = engine.world.objects['city:three-kingdoms:chengdu'];
    let found = false;
    let mapsToHall = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine.renderer.scene.traverse((o: any) => {
      if (o.name === 'buildings:roofs') {
        found = true;
        // Roofs must carry face ranges keyed by hall id so clicking a roof
        // selects its hall (not a deselecting dead-zone).
        const ranges = o.userData?.faceRanges as Array<{ id: string }> | undefined;
        mapsToHall = !!ranges?.some((r) => r.id.startsWith('city:'));
      }
    });
    return { chengduStyle: chengdu?.building?.style, roofMeshFound: found, roofMapsToHall: mapsToHall };
  });
  expect(chengduStyle).toBe('chinese');
  expect(roofMeshFound).toBe(true);
  expect(roofMapsToHall).toBe(true);

  // No console errors should occur while the chinese-style buildings + roofs load.
  expect(consoleErrors).toEqual([]);
});

test('historical map is reachable from the world panel', async ({ page }) => {
  await page.route('**/elevation-tiles-prod/**', (route) =>
    route.fulfill({ body: HILL_PNG, contentType: 'image/png' }),
  );
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 30_000 },
  );
  await page.getByTestId('world-toggle').click();
  const navPromise = page.waitForEvent('framenavigated');
  await page.getByTestId('historical-select').selectOption('three-kingdoms');
  await navPromise;
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.id === 'hist:three-kingdoms',
    undefined,
    { timeout: 30_000 },
  );
});
