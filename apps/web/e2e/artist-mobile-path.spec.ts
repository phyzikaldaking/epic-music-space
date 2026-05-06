import { expect, test } from "@playwright/test";

test("mobile artist onboarding path exposes dashboard and first-upload entry points", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only journey assertion");

  // In local dev, first navigation can include a cold compile pass.
  await page.goto("/auth/signin", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
  await expect(page.url()).toMatch(/\/auth\/signin|\/dashboard/);

  await page.goto("/studio/new", { waitUntil: "domcontentloaded", timeout: 20_000 });

  if (/\/auth\/signin/.test(page.url())) {
    const signupLink = page.getByRole("link", { name: /Sign up/i });
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toHaveAttribute("href", /callbackUrl=%2Fstudio%2Fnew/);
    await signupLink.click();
    await expect(page).toHaveURL(/\/auth\/signup/);
    await expect(page.getByRole("heading", { name: /Join Epic Music Space/i })).toBeVisible();
    return;
  }

  const createArtistAccount = page.getByRole("link", { name: /Create Artist Account/i });
  if (await createArtistAccount.isVisible()) {
    await expect(createArtistAccount).toHaveAttribute("href", /role=ARTIST/);

    await createArtistAccount.click();
    await expect(page).toHaveURL(/\/auth\/signup/);

    const current = new URL(page.url());
    expect(current.searchParams.get("role")).toBe("ARTIST");

    const callbackUrl = current.searchParams.get("callbackUrl") ?? "";
    expect(decodeURIComponent(callbackUrl)).toContain("/studio/setup?next=/studio/new");

    await expect(page.getByRole("heading", { name: /Join Epic Music Space/i })).toBeVisible();
    await expect(page.getByText(/Upload songs, earn royalties/i)).toBeVisible();
    await expect(page.getByText(/at least 13 years old/i)).toBeVisible();
    return;
  }

  // Authenticated path: upload form should be available directly.
  await expect(page.getByRole("heading", { name: /Upload Track/i })).toBeVisible();
  await expect(page.getByText(/Publish your music to the EMS marketplace/i)).toBeVisible();
});
