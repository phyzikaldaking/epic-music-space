import { expect, test } from "@playwright/test";

const studioModes = ["studio", "edit", "mix", "beat", "collab", "export"] as const;

test.describe("Studio runtime hardening", () => {
  test("mode buttons switch runtime screens without trapping the page", async ({ page }) => {
    await page.goto("/studio/try");
    await expect(page.getByTestId("studio-screen-runtime")).toBeVisible();

    for (const mode of studioModes) {
      await page.getByTestId(`studio-mode-${mode}`).click();
      await expect(page.getByTestId("studio-screen-runtime")).toHaveAttribute("data-studio-mode", mode);
      await expect(page.getByTestId("studio-active-screen")).toContainText(mode, { ignoreCase: true });
    }
  });

  test("browser window owns horizontal and vertical Studio scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    await page.goto("/studio/try");
    await expect(page.getByTestId("studio-screen-runtime")).toBeVisible();

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));

    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await page.evaluate(() => window.scrollTo({ left: 700, top: 500, behavior: "auto" }));
    await expect.poll(async () => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    const position = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(position.x).toBeGreaterThan(0);
    expect(position.y).toBeGreaterThan(0);
  });
});

test.describe("EMS main route navigation", () => {
  const routes = [
    ["Studio", "/studio/try"],
    ["Listening Sessions", "/listening-sessions"],
    ["Marketplace", "/marketplace"],
    ["Pricing", "/pricing"],
  ] as const;

  for (const [label, route] of routes) {
    test(`${label} route responds`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
