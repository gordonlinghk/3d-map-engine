import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: { editor?: unknown } }).__mapEngine?.editor,
    undefined,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(600);
}

function poiIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.keys((window as any).__mapEngine.world.objects).filter((k) => k.startsWith('poi:user:')),
  );
}

test('poi: place via editor, rename, list, autosave-reload, delete + undo', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');
  await waitForWorld(page);

  await page.getByTestId('edit-toggle').click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();

  // Enter POI placement mode.
  await page.getByTestId('editor-poi').click();
  await expect(page.getByTestId('editor-poi-hint')).toBeVisible();

  const before = await poiIds(page);
  expect(before).toHaveLength(0);

  // Click the ground to place a POI (mirrors add-building e2e pattern).
  await page.locator('canvas').first().click({ position: { x: 720, y: 500 } });

  await page.waitForFunction(
    (n) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.keys((window as any).__mapEngine.world.objects).filter((k) => k.startsWith('poi:user:')).length > n,
    before.length,
    { timeout: 10_000 },
  );

  const ids = await poiIds(page);
  expect(ids).toHaveLength(1);
  const id = ids[0]!;

  // Placement mode auto-exits and the new POI is selected.
  await expect(page.getByTestId('editor-poi-hint')).toBeHidden();

  const placed = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poiId) => (window as any).__mapEngine.world.objects[poiId].poi,
    id,
  );
  expect(placed.source).toBe('user-defined');
  expect(placed.icon).toBe('flag');

  // Rename via the panel (POI fields should be visible since it's selected).
  await expect(page.getByTestId('poi-name')).toBeVisible();
  await page.getByTestId('poi-name').fill('Rally Point');
  await page.getByTestId('poi-name').press('Enter');

  await page.waitForFunction(
    (poiId) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine.world.objects[poiId]?.poi?.name === 'Rally Point',
    id,
    { timeout: 5_000 },
  );

  // Change icon.
  await page.getByTestId('poi-icon').selectOption('danger');
  await page.waitForFunction(
    (poiId) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__mapEngine.world.objects[poiId]?.poi?.icon === 'danger',
    id,
    { timeout: 5_000 },
  );

  // Autosaved to localStorage.
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('map-engine.edits.'));
    return key ? localStorage.getItem(key) : null;
  });
  expect(stored).toContain('Rally Point');
  expect(stored).toContain('"addedPois"');

  // Reload — POI should still be present (overlay reapplied to regenerated world).
  await page.reload();
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 15_000 },
  );
  const reloaded = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poiId) => (window as any).__mapEngine.world.objects[poiId]?.poi,
    id,
  );
  expect(reloaded?.name).toBe('Rally Point');
  expect(reloaded?.icon).toBe('danger');

  // Appears in the side panel list (world reference is fresh post-reload, so
  // the atlas entries list — memoized on the world object — includes it).
  await expect(page.getByTestId(`list-item-${id}`)).toBeVisible();
  await expect(page.getByTestId(`list-item-${id}`)).toContainText('Rally Point');

  // Delete + undo.
  await page.getByTestId('edit-toggle').click();
  await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poiId) => (window as any).__mapEngine.renderer.setSelected(poiId),
    id,
  );
  await expect(page.getByTestId('poi-delete')).toBeVisible();
  await page.getByTestId('poi-delete').click();

  let exists = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poiId) => !!(window as any).__mapEngine.world.objects[poiId],
    id,
  );
  expect(exists).toBe(false);

  await page.getByTestId('editor-undo').click();
  exists = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (poiId) => !!(window as any).__mapEngine.world.objects[poiId],
    id,
  );
  expect(exists).toBe(true);

  // Clean up stored edits so other tests see a pristine world.
  await page.evaluate(() => localStorage.clear());
});

test('poi: layers panel toggle hides the pois layer checkbox', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'layers panel is desktop-first');
  await waitForWorld(page);

  await page.getByTestId('layers-toggle').click();
  await expect(page.getByTestId('layers-panel')).toBeVisible();
  const checkbox = page.getByTestId('layer-pois');
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeChecked();

  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();

  await checkbox.check();
  await expect(checkbox).toBeChecked();
});
