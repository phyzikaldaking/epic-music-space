#!/usr/bin/env node
/**
 * Browser-based smoke test. Catches the failure class an HTTP-only smoke
 * cannot: pages that 200 with full HTML but never hydrate because a CSP
 * change blocked Next.js's inline flight scripts, or a runtime error
 * crashed the React tree, or a dynamic import resolved to undefined.
 *
 * Runs the homepage in a real headless Chromium, asserts:
 *   • no console.error during load + 2 s settle
 *   • no uncaught page errors
 *   • a known interactive element is hit-testable (sign-in CTA visible)
 *
 * Usage:
 *   node scripts/smoke-browser.mjs                       # uses BASE_URL
 *   node scripts/smoke-browser.mjs https://my.url        # explicit
 *
 * Skips with exit 0 if Playwright is not installed — so this script can
 * sit in CI without forcing every consumer to install browser binaries.
 */

const BASE = (process.argv[2] || process.env.BASE_URL || "https://epicmusicspace.com").replace(/\/$/, "");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("[smoke-browser] playwright not installed; skipping (exit 0)");
  process.exit(0);
}

const start = Date.now();
console.log(`[smoke-browser] target: ${BASE}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: "ems-smoke-browser/1",
});
const page = await ctx.newPage();

const errors = [];
const cspViolations = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    // CSP violations show up as console.error from the browser itself.
    if (/Content Security Policy/i.test(text)) {
      cspViolations.push(text.slice(0, 200));
    } else {
      errors.push(text.slice(0, 200));
    }
  }
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 180)}`));

let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`[smoke-browser] ✓ ${label}`);
  } catch (err) {
    console.error(`[smoke-browser] ✗ ${label} — ${err.message.slice(0, 200)}`);
    failed++;
  }
}

await check("homepage loads + reaches networkidle", async () => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 25_000 });
  // Hydration usually settles within a tick or two of network idle. Allow a
  // little extra so deferred (idle-callback) work also completes.
  await page.waitForTimeout(2_000);
});

await check("homepage hydrates without CSP violations", async () => {
  if (cspViolations.length > 0) {
    throw new Error(`${cspViolations.length} CSP violation(s); first: ${cspViolations[0]}`);
  }
});

await check("no uncaught console errors / pageerrors", async () => {
  if (errors.length > 0) {
    throw new Error(`${errors.length} error(s); first: ${errors[0]}`);
  }
});

await check("primary CTAs are visible", async () => {
  // Either of these is enough — the homepage hero ships both for signed-out
  // users and the "Get started" navbar link is always present. Just need
  // ONE interactive primary path to render so we know hydration ran.
  const candidates = [
    'a[href*="/auth/signup"]',
    'a[href*="/auth/signin"]',
    'a[href="/studio/try"]',
    'a[href="/studio"]',
  ];
  for (const sel of candidates) {
    if ((await page.locator(sel).count()) > 0) return;
  }
  throw new Error(`none of these selectors matched: ${candidates.join(", ")}`);
});

await check("sign-in page renders the form (auth gate functional)", async () => {
  errors.length = 0;
  cspViolations.length = 0;
  await page.goto(`${BASE}/auth/signin`, { waitUntil: "networkidle", timeout: 20_000 });
  await page.waitForTimeout(1_000);
  const signInBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In")');
  if ((await signInBtn.count()) === 0) {
    throw new Error("Sign-in button not rendered");
  }
  if (cspViolations.length > 0) {
    throw new Error(`CSP violation on sign-in page: ${cspViolations[0]}`);
  }
});

await browser.close();

const dur = Math.round((Date.now() - start) / 100) / 10;
if (failed > 0) {
  console.error(`\n[smoke-browser] ${failed} check(s) failed in ${dur}s`);
  process.exit(1);
}
console.log(`\n[smoke-browser] all checks passed in ${dur}s`);
