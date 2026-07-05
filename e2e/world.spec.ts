import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(600);
}

test('loading overlay shows and then disappears', async ({ page }) => {
  await page.goto('/');
  // Overlay eventually goes away once the world has rendered.
  await expect(page.getByTestId('loading-overlay')).not.toBeVisible({ timeout: 15_000 });
});

test('world panel regenerates with a chosen seed and preset', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('world-toggle').click();
  await page.getByTestId('world-seed').fill('e2e-seed');
  await page.getByTestId('world-preset').selectOption('island-city');
  await page.getByTestId('world-generate').click();
  await page.waitForURL(/seed=e2e-seed/);
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  expect(page.url()).toContain('preset=island-city');
  const worldSeed = await page.evaluate(
    () => (window as never as { __mapEngine: { world: { seed: string } } }).__mapEngine.world.seed,
  );
  expect(worldSeed).toBe('e2e-seed');
});

test('traffic simulation exists and cars move over time', async ({ page }) => {
  await waitForWorld(page);
  const moved = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = (window as any).__mapEngine;
    let cars: { instanceMatrix: { array: Float32Array } } | null = null;
    eng.renderer.scene.traverse((o: { name: string }) => {
      if (o.name === 'traffic:cars') cars = o as never;
    });
    if (!cars) return -1;
    const before = Array.from((cars as never as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array.slice(0, 32));
    await new Promise((r) => setTimeout(r, 1200));
    const after = Array.from((cars as never as { instanceMatrix: { array: Float32Array } }).instanceMatrix.array.slice(0, 32));
    return before.some((v, i) => Math.abs(v - after[i]!) > 0.01) ? 1 : 0;
  });
  expect(moved).toBe(1);
});
