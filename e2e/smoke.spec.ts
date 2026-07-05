import { test, expect } from '@playwright/test';

test('demo renders a non-blank Three.js scene with FPS counter', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('fps')).toBeVisible();
  // FPS should become non-zero once the render loop is running.
  await expect(page.getByTestId('fps')).not.toHaveText('0 FPS', { timeout: 10_000 });
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
});
