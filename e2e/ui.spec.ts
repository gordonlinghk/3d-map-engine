import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(600);
}

test('search finds Cloudflare and selecting it opens the info panel', async ({ page }) => {
  await waitForWorld(page);
  const input = page.locator('.atlas-search input');
  await input.click();
  await input.fill('Cloudflare');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await page.getByTestId('search-results').getByText('Cloudflare').first().click();
  await expect(page.getByTestId('info-panel')).toBeVisible();
  await expect(page.getByTestId('info-panel')).toContainText('Cloudflare');
  await expect(page.getByTestId('info-panel')).toContainText('Founded');
});

test('search returns results for AI and Landmark keywords', async ({ page }) => {
  await waitForWorld(page);
  const input = page.locator('.atlas-search input');
  for (const term of ['AI', 'Landmark', 'Bridge']) {
    await input.click();
    await input.fill(term);
    await expect(page.getByTestId('search-results').locator('.row').first()).toBeVisible();
    await input.fill('');
  }
});

test('category chips filter the list and clicking an item selects it', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('chip-AI').click();
  const list = page.getByTestId('atlas-list');
  await expect(list.getByText('Anthropic')).toBeVisible();
  await expect(list.getByText('Airbnb')).toHaveCount(0);

  await list.getByText('Anthropic').click();
  await expect(page.getByTestId('info-panel')).toContainText('Anthropic');
  // Selected item is highlighted in the list.
  await expect(list.locator('.row.selected')).toHaveCount(1);

  // Landmarks chip shows landmarks.
  await page.getByTestId('chip-Landmarks').click();
  await expect(list.getByText('Golden Gate Bridge')).toBeVisible();
});

test('camera mode buttons and home/environment buttons work', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('mode-fly').click();
  const mode = await page.evaluate(() =>
    (window as never as { __mapEngine: { renderer: { getCameraMode(): string } } }).__mapEngine.renderer.getCameraMode(),
  );
  expect(mode).toBe('fly');
  await page.getByTestId('env-toggle').click();
  await page.getByTestId('home').click();
  await expect(page.getByTestId('minimap')).toBeVisible();
  await expect(page.getByTestId('fps')).toBeVisible();
});
