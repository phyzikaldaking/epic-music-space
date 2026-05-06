import path from "node:path";
import process from "node:process";
import { fail, info, loadEnvFile, missingKeys, repoRoot, runToolCommand } from "./lib.mjs";

const REQUIRED_KEYS = [
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "NEXT_PUBLIC_LIVEKIT_URL",
];
const TARGETS = ["production", "preview", "development"];
const shouldDeploy = process.argv.includes("--deploy");

const envFiles = [
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, ".env.production"),
  path.join(repoRoot, "apps", "web", ".env.local"),
];

const fileValues = envFiles.reduce((acc, filePath) => ({ ...acc, ...loadEnvFile(filePath) }), {});
const values = { ...fileValues, ...process.env };
const missing = missingKeys(values, REQUIRED_KEYS);

if (missing.length > 0) {
  fail(
    [
      `Missing required LiveKit values: ${missing.join(", ")}`,
      "Add them to your shell environment or .env.local, then re-run:",
      "npm run livekit:configure -- --deploy",
    ].join("\n"),
  );
}

let hadFailure = false;

for (const key of REQUIRED_KEYS) {
  const value = String(values[key]).trim();

  for (const target of TARGETS) {
    runToolCommand("vercel", ["env", "rm", key, target, "--yes"]);

    const addResult = runToolCommand("vercel", ["env", "add", key, target], {
      input: `${value}\n`,
    });

    if (!addResult.ok) {
      hadFailure = true;
      const detail = addResult.stderr.trim() || addResult.stdout.trim() || "unknown error";
      console.error(`FAIL ${key} (${target}): ${detail}`);
      continue;
    }

    info(`PASS ${key} (${target})`);
  }
}

if (hadFailure) {
  process.exit(1);
}

if (shouldDeploy) {
  info("Triggering a production deployment to apply LiveKit configuration...");
  const deployResult = runToolCommand("vercel", ["--prod", "--yes"], { stdio: "inherit" });
  if (!deployResult.ok) {
    fail("Production deploy failed after LiveKit env sync.");
  }
}

