import { test, expect } from '@playwright/test';

/**
 * Pre-baked worlds (`pnpm bake` → MapWorld JSON → `?world=<url>`). The
 * fixture is self-made: serialize the procedural world from a first visit,
 * serve it back as a static file on a mocked URL, and boot from it.
 */

test('?world= loads a serialized world file; failure falls back safely', async ({ page }) => {
  // Grab a serialized world to act as the baked file.
  await page.goto('/?seed=baked-fixture');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 30_000 },
  );
  const bakedJson = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    return JSON.stringify({ version: 1, world });
  });

  await page.route('**/cities/e2e-baked.map.json', (route) =>
    route.fulfill({ body: bakedJson, contentType: 'application/json' }),
  );

  await page.goto('/?world=cities/e2e-baked.map.json');
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.seed === 'baked-fixture' &&
      new URLSearchParams(window.location.search).has('world'),
    undefined,
    { timeout: 30_000 },
  );
  const loaded = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    return {
      id: world.id,
      buildings: Object.values(world.objects).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.objectType === 'building',
      ).length,
    };
  });
  expect(loaded.id).toBe('world:baked-fixture:coastal-tech-city');
  expect(loaded.buildings).toBeGreaterThan(100);

  // A missing file falls back to the procedural world instead of hanging.
  await page.goto('/?world=cities/does-not-exist.map.json&seed=fallback-seed');
  await page.waitForFunction(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine?.world?.seed === 'fallback-seed',
    undefined,
    { timeout: 30_000 },
  );
});
