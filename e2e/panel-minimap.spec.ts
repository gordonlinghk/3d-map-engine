import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(600);
}

test('side panel: text filter narrows the list live and clears', async ({ page }) => {
  await waitForWorld(page);
  if (await page.getByTestId('side-open').isVisible()) {
    await page.getByTestId('side-open').click();
  }
  const items = page.getByTestId('atlas-list').locator('.row');
  const before = await items.count();
  expect(before).toBeGreaterThan(10);

  await page.getByTestId('list-filter').fill('anthropic');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Anthropic');

  // Category text matches too.
  await page.getByTestId('list-filter').fill('fintech');
  expect(await items.count()).toBeGreaterThan(1);

  // No matches → friendly empty state, not a broken list.
  await page.getByTestId('list-filter').fill('zzzzzz');
  await expect(items).toHaveCount(0);
  await expect(page.getByTestId('atlas-list')).toContainText('No results for');

  // ✕ restores the full list.
  await page.getByTestId('list-filter-clear').click();
  await expect(items).toHaveCount(before);
});

test('minimap: clicking a spot flies the camera there', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'minimap is hidden on mobile');
  await waitForWorld(page);

  const before = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { camera } = (window as any).__mapEngine.renderer;
    return { x: camera.position.x, z: camera.position.z };
  });

  // Click near the top-left of the minimap → north-west of the world
  // (0.2 of the map ≈ world coordinate −0.6·half on both axes).
  const canvas = page.getByTestId('minimap').locator('canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });

  // The fly tween is dt-driven with dt clamped to 0.1 s — under CI's
  // software rendering (~4 FPS) the 1.1 s animation takes several wall
  // seconds, so poll for arrival instead of waiting a fixed time.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eng = (window as any).__mapEngine;
          const { camera } = eng.renderer;
          const half = (eng.world.config.chunksX * eng.world.config.chunkSize) / 2;
          const target = -0.6 * half;
          return Math.hypot(camera.position.x - target, camera.position.z - target) / half;
        }),
      { timeout: 30_000 },
    )
    .toBeLessThan(0.45);

  const after = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { camera } = (window as any).__mapEngine.renderer;
    return { x: camera.position.x, z: camera.position.z };
  });
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(50);
});
