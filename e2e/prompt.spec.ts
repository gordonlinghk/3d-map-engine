import { test, expect, type Page } from '@playwright/test';

async function waitForWorld(page: Page, url = '/'): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });
  await page.waitForTimeout(600);
}

test('prompt-to-map (local parser) regenerates a matching world', async ({ page }) => {
  await waitForWorld(page);
  await page.getByTestId('world-toggle').click();
  await page
    .getByTestId('prompt-input')
    .fill('a mountainous island city at night with dense skyscrapers');
  await page.getByTestId('prompt-generate').click();

  await page.waitForURL(/preset=island-city/, { timeout: 15_000 });
  await page.waitForFunction(() => !!(window as never as { __mapEngine?: unknown }).__mapEngine, undefined, {
    timeout: 15_000,
  });

  expect(page.url()).toContain('env=night');
  expect(page.url()).toContain('cfg=');

  const state = await page.evaluate(() => {
    const eng = (window as never as {
      __mapEngine: {
        world: { config: { preset: string; terrain: { hilliness: number }; city: { maxFloors: number; buildingDensity: number } } };
        renderer: { getEnvironment(): string };
      };
    }).__mapEngine;
    return {
      preset: eng.world.config.preset,
      hilliness: eng.world.config.terrain.hilliness,
      maxFloors: eng.world.config.city.maxFloors,
      density: eng.world.config.city.buildingDensity,
      environment: eng.renderer.getEnvironment(),
    };
  });
  expect(state.preset).toBe('island-city');
  expect(state.environment).toBe('night');
  expect(state.hilliness).toBeGreaterThan(0.5);
  expect(state.maxFloors).toBeGreaterThan(50);
  expect(state.density).toBeGreaterThan(0.8);
});

test('cfg URL param round-trips into the generated world', async ({ page }) => {
  const cfg = btoa(JSON.stringify({ maxFloors: 12, buildingDensity: 0.3 }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  await waitForWorld(page, `/?seed=cfg-check&preset=downtown-night-grid&cfg=${cfg}&env=golden-hour`);
  const state = await page.evaluate(() => {
    const eng = (window as never as {
      __mapEngine: {
        world: { config: { city: { maxFloors: number; buildingDensity: number } } };
        renderer: { getEnvironment(): string };
      };
    }).__mapEngine;
    return {
      maxFloors: eng.world.config.city.maxFloors,
      density: eng.world.config.city.buildingDensity,
      environment: eng.renderer.getEnvironment(),
    };
  });
  expect(state.maxFloors).toBe(12);
  expect(state.density).toBe(0.3);
  expect(state.environment).toBe('golden-hour');
});
