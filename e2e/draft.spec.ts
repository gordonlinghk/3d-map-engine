import { test, expect, type Page } from '@playwright/test';

/**
 * Draft files: save the edit overlay + base-world recipe to a .mapdraft.json
 * download, then reopen it to resume editing. navigator.webdriver forces the
 * download/file-input path (the File System Access pickers can't be driven
 * headlessly), which is exactly what these tests exercise.
 */

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: { editor?: unknown } }).__mapEngine?.editor,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(600);
}

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

test('draft: save to file, reopen, edits restored and editing resumes', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');
  await page.goto('/');
  await waitForEngine(page);

  // Edit a building.
  await page.getByTestId('edit-toggle').click();
  const id = await selectABuilding(page);
  await expect(page.getByTestId('editor-name')).toBeVisible();
  await page.getByTestId('editor-name').fill('Draft Tower');
  await page.getByTestId('editor-name').press('Enter');
  await page.getByTestId('editor-floors').fill('42');

  // Save the draft — headless gets the download path.
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('editor-save-draft').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mapdraft\.json$/);
  const draftPath = await download.path();

  // Wipe the autosave so restoration can only come from the draft file.
  await page.evaluate(() => localStorage.clear());
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('editor-open-draft').click();
  await (await chooserPromise).setFiles(draftPath);

  // Opening navigates and reboots the world from the draft.
  await waitForEngine(page);
  const restored = await page.evaluate((bid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (window as any).__mapEngine.world.objects[bid];
    return { name: obj.building.name, floors: obj.building.floors };
  }, id);
  expect(restored.name).toBe('Draft Tower');
  expect(restored.floors).toBe(42);

  // Edit mode resumed automatically and the editor is live.
  await expect(page.getByTestId('editor-panel')).toBeVisible();
  await page.evaluate((bid) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mapEngine.renderer.setSelected(bid);
  }, id);
  await page.getByTestId('editor-floors').fill('12');
  const floors = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (bid) => (window as any).__mapEngine.world.objects[bid].building.floors,
    id,
  );
  expect(floors).toBe(12);

  await page.evaluate(() => localStorage.clear());
});

test('draft: OSM world reopens from its snapshot without refetching', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');

  const FIXTURE = {
    elements: [
      { type: 'node', id: 1, lat: 35.6591, lon: 139.7007 },
      { type: 'node', id: 2, lat: 35.6591, lon: 139.7012 },
      { type: 'node', id: 3, lat: 35.6595, lon: 139.7012 },
      { type: 'node', id: 4, lat: 35.6595, lon: 139.7007 },
      {
        type: 'way',
        id: 100,
        nodes: [1, 2, 3, 4, 1],
        tags: { building: 'office', name: 'Mock Tower', height: '60' },
      },
    ],
  };
  await page.route('**/overpass-api.de/**', (route) =>
    route.fulfill({ json: FIXTURE, contentType: 'application/json' }),
  );

  await page.goto('/?city=tokyo-shibuya');
  await waitForEngine(page);

  // Rename the OSM building, save a draft.
  await page.getByTestId('edit-toggle').click();
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__mapEngine.renderer.setSelected('bldg:osm:100');
  });
  await expect(page.getByTestId('editor-name')).toBeVisible();
  await page.getByTestId('editor-name').fill('Edited Tower');
  await page.getByTestId('editor-name').press('Enter');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('editor-save-draft').click();
  const draftPath = await (await downloadPromise).path();

  // Kill the network: any further Overpass call now fails loudly.
  await page.unroute('**/overpass-api.de/**');
  await page.route('**/overpass-api.de/**', (route) => route.abort());
  await page.evaluate(() => localStorage.clear());

  await page.getByTestId('draft-file-input').setInputFiles(draftPath);
  await waitForEngine(page);

  const restored = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    return { id: world.id, name: world.objects['bldg:osm:100']?.building?.name };
  });
  expect(restored.id).toBe('osm:Tokyo Shibuya');
  expect(restored.name).toBe('Edited Tower');

  await page.evaluate(() => localStorage.clear());
});

test('draft: a corrupt file is rejected with a readable error', async ({ page, viewport }) => {
  test.skip(!!viewport && viewport.width < 900, 'editor is desktop-first');
  await page.goto('/');
  await waitForEngine(page);
  await page.getByTestId('edit-toggle').click();

  let message = '';
  page.once('dialog', (dialog) => {
    message = dialog.message();
    void dialog.dismiss();
  });
  await page.getByTestId('draft-file-input').setInputFiles({
    name: 'broken.mapdraft.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect.poll(() => message).toContain('Could not open draft');

  // The session survives — the engine is still running.
  const alive = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => !!(window as any).__mapEngine?.world,
  );
  expect(alive).toBe(true);
});
