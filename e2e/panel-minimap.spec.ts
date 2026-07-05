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

  // Click near the top-left of the minimap → north-west of the world.
  const canvas = page.getByTestId('minimap').locator('canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.2, y: box.height * 0.2 } });
  await page.waitForTimeout(2000); // fly animation

  const after = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = (window as any).__mapEngine;
    const { camera } = eng.renderer;
    const half = (eng.world.config.chunksX * eng.world.config.chunkSize) / 2;
    return { x: camera.position.x, z: camera.position.z, half };
  });

  // The camera moved, and toward the north-west quadrant target
  // (0.2 of the map ≈ world coordinate −0.6·half on both axes).
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  expect(moved).toBeGreaterThan(50);
  const target = -0.6 * after.half;
  expect(Math.hypot(after.x - target, after.z - target)).toBeLessThan(after.half * 0.45);
});
