import { expect, test } from "@playwright/test";

const routes = [
  ["home", "/"],
  ["studio", "/studio/try"],
  ["listening-sessions", "/listening-sessions"],
  ["marketplace", "/marketplace"],
] as const;

test.describe("EMS visual regression", () => {
  for (const [name, route] of routes) {
    test(`${name} screenshot baseline`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  }
});

test.describe("EMS deployment smoke tests", () => {
  test("core navigation responds without runtime crashes", async ({ page }) => {
    await page.goto("/");

    const links = [
      ["Studio", "/studio/try"],
      ["Marketplace", "/marketplace"],
      ["Listening Sessions", "/listening-sessions"],
      ["Pricing", "/pricing"],
    ] as const;

    for (const [label, expectedRoute] of links) {
      const link = page.getByRole("link", { name: new RegExp(label, "i") }).first();
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(new RegExp(expectedRoute.replace("/", "\\/")));
      await expect(page.locator("body")).toBeVisible();
    }
  });
});