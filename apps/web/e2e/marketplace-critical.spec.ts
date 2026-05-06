import { expect, test, type Page } from "@playwright/test";

async function acceptCookiesIfPresent(page: Page) {
  const accept = page.getByRole("button", { name: /^Accept$/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

async function openMarketplace(page: Page, path = "/marketplace") {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /premium exchange floor/i })).toBeVisible();
  await acceptCookiesIfPresent(page);
}

test("mobile tracks tab opens themed marketplace catalog", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile navigation coverage only");

  await openMarketplace(page);
  await expect(page).toHaveURL(/\/marketplace/);
  await expect(page.locator("#marketplace-catalog")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Studio monitor listings/i })).toBeVisible();
  await expect(page.getByText(/premium exchange floor/i)).toBeVisible();
  await expect(page.getByText(/Ranked Catalog/i)).toBeVisible();
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
});

test("marketplace empty search shows themed recovery state", async ({ page }) => {
  await openMarketplace(page, "/marketplace?q=__no_match__");

  await expect(page).toHaveURL(/__no_match__/);
  await expect(page.getByText(/No exact matches yet/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Reset Filters/i })).toBeVisible();
  await expect(page.getByText(/Tracks Standby/i)).toBeVisible();
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
});
