import { test, expect } from '@playwright/test';

test('studio route renders and scrolls', async ({ page }) => {
  await page.goto('/studio/try');

  await expect(page.locator('body')).toBeVisible();

  await page.mouse.wheel(2400, 1600);

  const scrollY = await page.evaluate(() => window.scrollY);

  expect(scrollY).toBeGreaterThan(0);
});
