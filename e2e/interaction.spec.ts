import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __mapEngine?: any;
  }
}

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__mapEngine?.renderer, undefined, {
    timeout: 15_000,
  });
  // Give the render loop a moment to settle.
  await page.waitForTimeout(800);
}

test('fly mode moves the camera with WASD', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('mode-fly').click();
  const before = await page.evaluate(() => {
    const c = window.__mapEngine.renderer.camera;
    return { x: c.position.x, y: c.position.y, z: c.position.z };
  });
  await page.locator('canvas').click({ position: { x: 700, y: 400 } });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const c = window.__mapEngine.renderer.camera;
    return { x: c.position.x, y: c.position.y, z: c.position.z };
  });
  const dist = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  expect(dist).toBeGreaterThan(10);
});

test('clicking a building selects it and opens the info panel', async ({ page }) => {
  await waitForWorld(page);
  // Project a known company tower into screen space and click it.
  const screenPos = await page.evaluate(() => {
    const eng = window.__mapEngine;
    const { renderer, world } = eng;
    const objects = Object.values(world.objects) as Array<{
      objectType: string;
      building?: { id: string; position: { x: number; y: number; z: number }; height: number; metadata?: unknown };
    }>;
    const towers = objects
      .filter((o) => o.objectType === 'building' && o.building?.metadata)
      .sort((a, b) => (b.building?.height ?? 0) - (a.building?.height ?? 0));
    const target = towers[0]!.building!;
    // Fly close to the tower first so the click is unambiguous.
    return renderer.focusObject(target.id).then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const THREE = (window as any).__THREE ?? null;
      const cam = renderer.camera;
      const v = {
        x: target.position.x,
        y: target.position.y + target.height * 0.5,
        z: target.position.z,
      };
      // Manual projection without importing THREE.
      const vec = new DOMPoint(v.x, v.y, v.z, 1);
      const m = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
      const e = m.elements;
      const w = e[3] * vec.x + e[7] * vec.y + e[11] * vec.z + e[15];
      const ndcX = (e[0] * vec.x + e[4] * vec.y + e[8] * vec.z + e[12]) / w;
      const ndcY = (e[1] * vec.x + e[5] * vec.y + e[9] * vec.z + e[13]) / w;
      const canvas = renderer.domElement;
      void THREE;
      return {
        x: ((ndcX + 1) / 2) * canvas.clientWidth,
        y: ((1 - ndcY) / 2) * canvas.clientHeight,
        id: target.id,
      };
    });
  });

  await page.waitForTimeout(300);
  await page.locator('canvas').click({ position: { x: screenPos.x, y: screenPos.y } });
  await expect(page.getByTestId('info-panel')).toBeVisible({ timeout: 5_000 });
  const selectedId = await page.evaluate(() => window.__mapEngine.renderer.getSelected());
  expect(selectedId).toBeTruthy();

  // Escape clears the selection.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('info-panel')).not.toBeVisible();
});

test('focusObject flies the camera toward a landmark', async ({ page }) => {
  await waitForWorld(page);
  const { before, after, landmarkPos } = await page.evaluate(async () => {
    const { renderer, world } = window.__mapEngine;
    const lm = world.landmarks[0];
    const c = renderer.camera;
    const before = { x: c.position.x, y: c.position.y, z: c.position.z };
    await renderer.focusObject(lm.id);
    const after = { x: c.position.x, y: c.position.y, z: c.position.z };
    return { before, after, landmarkPos: lm.position };
  });
  const distBefore = Math.hypot(
    before.x - landmarkPos.x,
    before.z - landmarkPos.z,
  );
  const distAfter = Math.hypot(after.x - landmarkPos.x, after.z - landmarkPos.z);
  expect(distAfter).toBeLessThan(distBefore);
  expect(distAfter).toBeLessThan(400);
});
