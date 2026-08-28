import { expect, test } from "@playwright/test";

test("Studio loads its scoped workstation layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio", { waitUntil: "networkidle" });

  const command = page.locator(".studio-command");
  const brandMark = page.locator(".studio-brand__mark");

  await expect(command).toBeVisible();
  await expect(command).toHaveCSS("position", "relative");
  await expect(brandMark).toHaveCSS("width", "38px");
  await expect(brandMark).toHaveCSS("height", "38px");
});
