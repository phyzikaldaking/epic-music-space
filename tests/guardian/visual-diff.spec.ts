import { test, expect } from '@playwright/test';

const routes = [
  { name: 'home', path: '/' },
  { name: 'studio-try', path: '/studio/try' },
  { name: 'beat-machine', path: '/studio/beat-machine' },
];

for (const route of routes) {
  test(`${route.name} visual baseline`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page).toHaveScreenshot(`${route.name}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    });
  });
}

test('studio outer-window scroll visual proof', async ({ page }) => {
  await page.goto('/studio/try', { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.mouse.wheel(1800, 1200);
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  expect(scroll.y).toBeGreaterThan(0);
  await expect(page).toHaveScreenshot('studio-try-scrolled.png', {
    fullPage: false,
    animations: 'disabled',
    maxDiffPixelRatio: 0.03,
  });
});
