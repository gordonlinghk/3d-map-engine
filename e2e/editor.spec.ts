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

/** Select some tall building via the API and return its id. */
async function selectABuilding(page: Page): Promise<string> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = (window as any).__mapEngine;
    const b = Object.values(eng.world.objects).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (o: any) => o.objectType === 'building' && o.building.floors > 10,
    ) as { id: string };
    eng.renderer.setSelected(b.id);
    return b.id;
  });
}

test('editor: floors + rename + delete + undo, persisted across reload', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');
  await waitForWorld(page);

  await page.getByTestId('edit-toggle').click();
  await expect(page.getByTestId('editor-panel')).toBeVisible();

  const id = await selectABuilding(page);
  await expect(page.getByTestId('editor-name')).toBeVisible();

  // Rename.
  await page.getByTestId('editor-name').fill('Gordon Tower');
  await page.getByTestId('editor-name').press('Enter');

  // Change floors via slider (fill sets value + fires change).
  await page.getByTestId('editor-floors').fill('60');

  const after = await page.evaluate((bid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (window as any).__mapEngine.world.objects[bid];
    return { name: obj.building.name, floors: obj.building.floors };
  }, id);
  expect(after.name).toBe('Gordon Tower');
  expect(after.floors).toBe(60);

  // Persisted overlay in localStorage.
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('map-engine.edits.'));
    return key ? localStorage.getItem(key) : null;
  });
  expect(stored).toContain('Gordon Tower');

  // Reload — edits reapply to the regenerated world.
  await page.reload();
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 15_000 },
  );
  const reloaded = await page.evaluate((bid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (window as any).__mapEngine.world.objects[bid];
    return { name: obj.building.name, floors: obj.building.floors };
  }, id);
  expect(reloaded.name).toBe('Gordon Tower');
  expect(reloaded.floors).toBe(60);

  // Delete + undo restores.
  await page.getByTestId('edit-toggle').click();
  await page.evaluate((bid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mapEngine.renderer.setSelected(bid);
  }, id);
  await page.getByTestId('editor-delete').click();
  let exists = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bid) => !!(window as any).__mapEngine.world.objects[bid],
    id,
  );
  expect(exists).toBe(false);

  await page.getByTestId('editor-undo').click();
  exists = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bid) => !!(window as any).__mapEngine.world.objects[bid],
    id,
  );
  expect(exists).toBe(true);

  // Clean up stored edits so other tests see a pristine world.
  await page.evaluate(() => localStorage.clear());
});

test('editor: add mode places a new user building', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');
  await waitForWorld(page);

  await page.getByTestId('edit-toggle').click();
  await page.getByTestId('editor-add').click();
  await expect(page.getByTestId('editor-add-hint')).toBeVisible();

  const before = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => Object.keys((window as any).__mapEngine.world.objects).filter((k) => k.startsWith('bldg:user:')).length,
  );
  await page.locator('canvas').first().click({ position: { x: 720, y: 500 } });

  await page.waitForFunction(
    (n) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.keys((window as any).__mapEngine.world.objects).filter((k) => k.startsWith('bldg:user:')).length > n,
    before,
    { timeout: 10_000 },
  );
  const added = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objs = (window as any).__mapEngine.world.objects;
    const key = Object.keys(objs).find((k) => k.startsWith('bldg:user:'))!;
    return objs[key].building;
  });
  expect(added.source).toBe('user-defined');
  expect(added.floors).toBe(8);
  await page.evaluate(() => localStorage.clear());
});
