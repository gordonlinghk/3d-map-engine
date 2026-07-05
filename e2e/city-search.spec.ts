import { test, expect, type Page } from '@playwright/test';

/**
 * City geocoding search (world panel). Photon and Overpass are both mocked:
 * the fixtures give two same-name "Paris" candidates so the disambiguation UI
 * is exercised, and the Overpass extract sits inside the Texas bbox so the
 * chosen city actually converts into a world.
 */

const PHOTON_FIXTURE = {
  features: [
    {
      geometry: { coordinates: [2.3484, 48.8535], type: 'Point' },
      properties: {
        osm_type: 'R',
        osm_id: 71525,
        extent: [2.2241, 48.9022, 2.4698, 48.8156],
        country: 'France',
        osm_key: 'boundary',
        osm_value: 'administrative',
        name: 'Paris',
        state: 'Île-de-France',
      },
    },
    {
      geometry: { coordinates: [-95.5555, 33.6609], type: 'Point' },
      properties: {
        osm_type: 'N',
        osm_id: 151374347,
        country: 'United States',
        osm_key: 'place',
        osm_value: 'city',
        name: 'Paris',
        state: 'Texas',
      },
    },
  ],
};

/** Two buildings + a road inside the Paris, Texas search window. */
const OVERPASS_FIXTURE = {
  elements: [
    { type: 'node', id: 1, lat: 33.6605, lon: -95.556 },
    { type: 'node', id: 2, lat: 33.6605, lon: -95.5555 },
    { type: 'node', id: 3, lat: 33.6609, lon: -95.5555 },
    { type: 'node', id: 4, lat: 33.6609, lon: -95.556 },
    {
      type: 'way',
      id: 100,
      nodes: [1, 2, 3, 4, 1],
      tags: { building: 'office', name: 'Lamar Tower', height: '40' },
    },
    { type: 'node', id: 20, lat: 33.659, lon: -95.558 },
    { type: 'node', id: 21, lat: 33.663, lon: -95.553 },
    { type: 'way', id: 200, nodes: [20, 21], tags: { highway: 'primary' } },
  ],
};

async function openWorldPanel(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 30_000 },
  );
  await page.getByTestId('world-toggle').click();
  await expect(page.getByTestId('city-search-input')).toBeVisible();
}

test('city search: suggestions disambiguate same-name cities; selection loads the map', async ({
  page,
}) => {
  let photonCalls = 0;
  await page.route('**/photon.komoot.io/**', (route) => {
    photonCalls += 1;
    return route.fulfill({ json: PHOTON_FIXTURE, contentType: 'application/json' });
  });
  await page.route('**/overpass-api.de/**', (route) =>
    route.fulfill({ json: OVERPASS_FIXTURE, contentType: 'application/json' }),
  );

  await openWorldPanel(page);

  // Type quickly — debounce folds the keystrokes into one request.
  await page.getByTestId('city-search-input').pressSequentially('Paris', { delay: 60 });
  await expect(page.getByTestId('city-search-results')).toBeVisible();
  expect(photonCalls).toBe(1);

  const options = page.getByTestId('city-search-results').getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Île-de-France, France');
  await expect(options.nth(1)).toContainText('Texas, United States');

  // Keyboard: ↓ to the Texas entry, Enter selects and navigates.
  const navPromise = page.waitForEvent('framenavigated');
  await page.getByTestId('city-search-input').press('ArrowDown');
  await page.getByTestId('city-search-input').press('Enter');
  await navPromise;

  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eng = (window as any).__mapEngine;
      return !!eng?.world?.id?.startsWith('osm:');
    },
    undefined,
    { timeout: 30_000 },
  );
  const info = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { world } = (window as any).__mapEngine;
    return {
      id: world.id,
      hasTower: Object.values(world.objects).some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (o: any) => o.objectType === 'building' && o.building.name === 'Lamar Tower',
      ),
      url: window.location.search,
    };
  });
  expect(info.id).toBe('osm:Paris — Texas, United States');
  expect(info.hasTower).toBe(true);
  expect(info.url).toContain('bbox=');
  expect(info.url).not.toContain('city=');

  // The world panel reports the current selection.
  await page.getByTestId('world-toggle').click();
  await expect(page.getByTestId('city-current')).toContainText('Paris — Texas');
});

test('city search: empty and error states are reported, map generation is untouched', async ({
  page,
}) => {
  await page.route('**/photon.komoot.io/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q === 'zzzz') {
      return route.fulfill({ json: { features: [] }, contentType: 'application/json' });
    }
    return route.abort(); // network failure for anything else
  });

  await openWorldPanel(page);
  const input = page.getByTestId('city-search-input');

  await input.fill('zzzz');
  await expect(page.getByTestId('city-search-empty')).toBeVisible();

  await input.fill('paris');
  await expect(page.getByTestId('city-search-error')).toBeVisible();
  await expect(page.getByTestId('city-search-error')).toContainText(/unreachable/i);

  // No navigation happened — the procedural world is still there.
  const stillProcedural = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__mapEngine.world.id.startsWith('world:'),
  );
  expect(stillProcedural).toBe(true);
});

test('an invalid ?bbox= URL falls back to the procedural world', async ({ page }) => {
  await page.goto('/?bbox=91,2,92,3&cityName=Bad');
  await page.waitForFunction(
    () => !!(window as never as { __mapEngine?: unknown }).__mapEngine,
    undefined,
    { timeout: 30_000 },
  );
  const id = await page.evaluate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (window as any).__mapEngine.world.id,
  );
  expect(id).toMatch(/^world:/);
});
