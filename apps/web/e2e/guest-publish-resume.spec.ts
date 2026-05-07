import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "ems-guest-stash";
const STORE = "mixes";
const ENTRY_KEY = "current";

async function clearGuestStash(page: Page) {
  await page.evaluate(async ({ dbName }) => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }, { dbName: DB_NAME });
}

async function seedGuestStash(
  page: Page,
  createdAt: number,
) {
  await page.evaluate(
    async ({ dbName, store, key, createdAtMs }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
        };
        open.onerror = () => reject(open.error ?? new Error("open failed"));
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(
            {
              blob: new Blob(["ems mix"], { type: "audio/wav" }),
              fileName: "guest-take.wav",
              createdAt: createdAtMs,
            },
            key,
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error("put failed"));
        };
      });
    },
    { dbName: DB_NAME, store: STORE, key: ENTRY_KEY, createdAtMs: createdAt },
  );
}

test.describe("guest publish resume funnel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await clearGuestStash(page);
  });

  test("sends guest magic-link request with studio resume callback when stash exists", async ({ page }) => {
    let body: Record<string, unknown> | null = null;

    await seedGuestStash(page, Date.now());

    await page.route("**/api/auth/guest-magic-link", async (route) => {
      const raw = route.request().postData() ?? "{}";
      body = JSON.parse(raw) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/studio/try/save", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /Drop your email/i })).toBeVisible();

    await page.getByPlaceholder("you@example.com").fill("creator@example.com");
    await page.getByRole("button", { name: /Send me the link/i }).click();

    await expect(page.getByRole("heading", { name: /Link sent/i })).toBeVisible();
    const captured = body as Record<string, unknown> | null;
    expect(captured).not.toBeNull();
    expect(captured?.email).toBe("creator@example.com");
    expect(captured?.callbackUrl).toBe("/studio/new?from=guest-resume");
  });

  test("shows no-stash recovery state when no mix is stored", async ({ page }) => {
    await page.goto("/studio/try/save", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /No saved mix to keep/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open the studio/i })).toHaveAttribute("href", "/studio/try");
  });

  test("treats expired stash as missing and shows recovery state", async ({ page }) => {
    const olderThanTtl = Date.now() - 25 * 60 * 60 * 1000;
    await seedGuestStash(page, olderThanTtl);

    await page.goto("/studio/try/save", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByRole("heading", { name: /No saved mix to keep/i })).toBeVisible();
  });
});
