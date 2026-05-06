import { expect, test } from "@playwright/test";

test("public discovery surfaces load", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect(page.locator("main")).toBeVisible();

  await page.goto("/radar", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect(page.getByText(/A&R Radar/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Artists moving before the charts/i })).toBeVisible();

  await page.goto("/marketplace", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect(page.locator("#main-content")).toBeVisible();

  await page.goto("/status", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect(page.locator("#main-content")).toBeVisible();
});

test("signup page exposes required trust gates", async ({ page }) => {
  await page.goto("/auth/signup", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await expect(page.getByRole("textbox", { name: "you@example.com" })).toBeVisible();
  await expect(page.getByText(/at least 13 years old/i)).toBeVisible();
  await expect(page.locator("#main-content").getByRole("link", { name: /terms of service/i })).toBeVisible();
});
