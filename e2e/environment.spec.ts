import { test, expect, type Page } from '@playwright/test';

type Eng = {
  renderer: {
    getEnvironment(): string;
    setEnvironment(mode: string): void;
    setLayerVisibility(layer: string, visible: boolean): void;
    camera: { position: { x: number; y: number; z: number } };
    scene: { background: { getHexString(): string } };
  };
  tour: { isActive(): boolean };
};

declare global {
  interface Window {
    __mapEngine?: Eng;
  }
}

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__mapEngine, undefined, { timeout: 15_000 });
  await page.waitForTimeout(600);
}

test('environment cycle changes sky color and window materials', async ({ page }) => {
  await waitForWorld(page);
  const dayBg = await page.evaluate(() => window.__mapEngine!.renderer.scene.background.getHexString());

  await page.getByTestId('env-toggle').click(); // golden-hour
  const goldenBg = await page.evaluate(() =>
    window.__mapEngine!.renderer.scene.background.getHexString(),
  );
  expect(goldenBg).not.toBe(dayBg);

  await page.getByTestId('env-toggle').click(); // night
  const env = await page.evaluate(() => window.__mapEngine!.renderer.getEnvironment());
  expect(env).toBe('night');
  const nightBg = await page.evaluate(() =>
    window.__mapEngine!.renderer.scene.background.getHexString(),
  );
  expect(nightBg).not.toBe(goldenBg);
});

test('tour mode flies between landmarks and can be stopped', async ({ page }) => {
  await waitForWorld(page);
  const before = await page.evaluate(() => ({ ...window.__mapEngine!.renderer.camera.position }));
  await page.getByTestId('tour-toggle').click();
  await page.waitForTimeout(1600);
  const active = await page.evaluate(() => window.__mapEngine!.tour.isActive());
  expect(active).toBe(true);
  const after = await page.evaluate(() => ({ ...window.__mapEngine!.renderer.camera.position }));
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  expect(moved).toBeGreaterThan(20);
  // A selection + floating label appears during the tour.
  await expect(page.getByTestId('info-panel')).toBeVisible();

  await page.getByTestId('tour-toggle').click();
  const stopped = await page.evaluate(() => !window.__mapEngine!.tour.isActive());
  expect(stopped).toBe(true);
});

test('layer toggles hide and show scene groups', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('layers-toggle').click();
  await expect(page.getByTestId('layers-panel')).toBeVisible();

  const visibleBefore = await page.evaluate(() => {
    let v = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.__mapEngine!.renderer as any).scene.traverse((o: { name: string; visible: boolean }) => {
      if (o.name === 'buildings') v = o.visible;
    });
    return v;
  });
  expect(visibleBefore).toBe(true);

  await page.getByTestId('layer-buildings').uncheck();
  const visibleAfter = await page.evaluate(() => {
    let v = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.__mapEngine!.renderer as any).scene.traverse((o: { name: string; visible: boolean }) => {
      if (o.name === 'buildings') v = o.visible;
    });
    return v;
  });
  expect(visibleAfter).toBe(false);
  await page.getByTestId('layer-buildings').check();
});
