import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(1200);
}

test('scene is not blank — canvas pixels have real variance', async ({ page }) => {
  await waitForWorld(page);
  const variance = await page.evaluate(() => {
    const src = document.querySelector('canvas')!;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
      sum += lum;
      sumSq += lum * lum;
    }
    const mean = sum / n;
    return sumSq / n - mean * mean;
  });
  expect(variance).toBeGreaterThan(100);
});

test('UI regions do not overlap', async ({ page, isMobile }) => {
  await waitForWorld(page);
  const boxes: Array<{ name: string; box: { x: number; y: number; width: number; height: number } }> = [];
  const targets: Array<[string, string]> = [
    ['search', '.atlas-search input'],
    ['toolbar', '[data-testid="camera-modes"]'],
    ['fps', '[data-testid="fps"]'],
  ];
  if (!isMobile) {
    targets.push(['side', '[data-testid="side-panel"]'], ['minimap', '[data-testid="minimap"]']);
  }
  for (const [name, sel] of targets) {
    const el = page.locator(sel).first();
    if (await el.isVisible()) {
      const box = await el.boundingBox();
      if (box) boxes.push({ name, box });
    }
  }
  expect(boxes.length).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!.box;
      const b = boxes[j]!.box;
      const overlap =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${boxes[i]!.name} overlaps ${boxes[j]!.name}`).toBe(false);
    }
  }
});

test('mobile: side panel is collapsed by default and can be opened', async ({ page, viewport }) => {
  test.skip(!viewport || viewport.width > 900, 'mobile-only check');
  await waitForWorld(page);
  await expect(page.getByTestId('side-panel')).not.toBeVisible();
  await page.getByTestId('side-open').click();
  await expect(page.getByTestId('side-panel')).toBeVisible();
});
