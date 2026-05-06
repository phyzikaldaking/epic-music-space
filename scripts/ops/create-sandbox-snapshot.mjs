#!/usr/bin/env node
/**
 * Bake a Vercel Sandbox snapshot with Chromium + agent-browser pre-installed.
 *
 * Run once. Outputs a snapshot id; copy it to AGENT_BROWSER_SNAPSHOT_ID in
 * the Vercel project's env vars, redeploy, and the visual-regression cron
 * will boot in <1 s instead of ~30 s.
 *
 * Re-run when:
 *   - You upgrade agent-browser (new chromium version)
 *   - The Amazon Linux base changes its dnf catalog meaningfully
 *
 * Requires the same auth as the cron route — VERCEL_OIDC_TOKEN if running
 * inside Vercel, or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID
 * locally.
 */

import { Sandbox } from "@vercel/sandbox";

const CHROMIUM_SYSTEM_DEPS = [
  "nss", "nspr", "libxkbcommon", "atk", "at-spi2-atk", "at-spi2-core",
  "libXcomposite", "libXdamage", "libXrandr", "libXfixes", "libXcursor",
  "libXi", "libXtst", "libXScrnSaver", "libXext", "mesa-libgbm", "libdrm",
  "mesa-libGL", "mesa-libEGL", "cups-libs", "alsa-lib", "pango", "cairo",
  "gtk3", "dbus-libs",
];

function credentials() {
  if (
    process.env.VERCEL_TOKEN &&
    process.env.VERCEL_TEAM_ID &&
    process.env.VERCEL_PROJECT_ID
  ) {
    return {
      token: process.env.VERCEL_TOKEN,
      teamId: process.env.VERCEL_TEAM_ID,
      projectId: process.env.VERCEL_PROJECT_ID,
    };
  }
  return {};
}

async function main() {
  const t0 = Date.now();
  console.log("[snapshot] booting fresh sandbox …");
  const sandbox = await Sandbox.create({
    ...credentials(),
    runtime: "node24",
    timeout: 600_000, // give dnf + npm install + chromium download room
  });

  try {
    console.log("[snapshot] installing chromium system libs …");
    const dnf = await sandbox.runCommand("sh", [
      "-c",
      `sudo dnf clean all && sudo dnf install -y --skip-broken ${CHROMIUM_SYSTEM_DEPS.join(" ")} && sudo ldconfig`,
    ]);
    if (dnf.exitCode !== 0) {
      throw new Error(`dnf install failed (exit ${dnf.exitCode})`);
    }

    console.log("[snapshot] installing agent-browser …");
    await sandbox.runCommand("npm", ["install", "-g", "agent-browser"]);
    await sandbox.runCommand("npx", ["agent-browser", "install"]);

    // Smoke-test before baking. If chromium can't even launch, baking the
    // snapshot just enshrines a broken image and every cron run will fail.
    console.log("[snapshot] smoke-testing chromium …");
    const test = await sandbox.runCommand("agent-browser", ["open", "https://example.com"]);
    if (test.exitCode !== 0) {
      throw new Error("smoke test failed: chromium did not launch cleanly");
    }
    await sandbox.runCommand("agent-browser", ["close"]);

    console.log("[snapshot] freezing image …");
    const snap = await sandbox.snapshot();
    const elapsed = Math.round((Date.now() - t0) / 1000);

    console.log(`\n✓ Snapshot baked in ${elapsed}s`);
    console.log(`  AGENT_BROWSER_SNAPSHOT_ID=${snap.snapshotId}`);
    console.log(`\nNext: paste the value above into the Vercel project env vars and redeploy.`);
  } finally {
    await sandbox.stop();
  }
}

main().catch((err) => {
  console.error("[snapshot] failed:", err);
  process.exit(1);
});
