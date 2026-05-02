// Update Vercel project settings via the Vercel REST API.
//
// Usage:
//   node scripts/ops/vercel-project.mjs [options]
//
// Options:
//   --root-dir <path>           Set (or clear with "") the project root directory
//   --build-command <cmd>       Override the build command (empty string clears it)
//   --install-command <cmd>     Override the install command (empty string clears it)
//   --output-dir <dir>          Override the output directory (empty string clears it)
//   --clear-overrides           Clear all build / install / output overrides at once
//
// Required env:
//   VERCEL_TOKEN      Personal or team API token (set in Doppler or .env.local)
//   VERCEL_PROJECT_ID Project ID  (set in .vercel/project.json or Doppler)
//   VERCEL_ORG_ID     Team / org ID  (same sources)

import path from "node:path";
import process from "node:process";
import {
  fail,
  info,
  loadEnvFile,
  readVercelLink,
  repoRoot,
} from "./lib.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextValue(argv, i, flag) {
  const val = argv[i + 1];
  if (val === undefined || val.startsWith("--")) {
    fail(`${flag} requires a value.`);
  }
  return val;
}

function parseArgs(argv) {
  const args = { clearOverrides: false, patch: {} };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--clear-overrides") {
      args.clearOverrides = true;
    } else if (arg === "--root-dir") {
      const val = nextValue(argv, i, "--root-dir");
      args.patch.rootDirectory = val === "" ? null : val;
      i++;
    } else if (arg === "--build-command") {
      const val = nextValue(argv, i, "--build-command");
      args.patch.buildCommand = val === "" ? null : val;
      i++;
    } else if (arg === "--install-command") {
      const val = nextValue(argv, i, "--install-command");
      args.patch.installCommand = val === "" ? null : val;
      i++;
    } else if (arg === "--output-dir") {
      const val = nextValue(argv, i, "--output-dir");
      args.patch.outputDirectory = val === "" ? null : val;
      i++;
    } else {
      fail(`Unknown argument: ${arg}\nRun with --help to see usage.`);
    }
    i++;
  }
  return args;
}

async function patchVercelProject(token, projectId, teamId, body) {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}`);
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      detail = JSON.parse(text)?.error?.message ?? text;
    } catch {
      // keep raw text
    }
    throw new Error(`Vercel API error ${response.status}: ${detail}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage: node scripts/ops/vercel-project.mjs [options]

Options:
  --root-dir <path>        Set project root directory ("" to clear)
  --build-command <cmd>    Override build command ("" to clear)
  --install-command <cmd>  Override install command ("" to clear)
  --output-dir <dir>       Override output directory ("" to clear)
  --clear-overrides        Clear all build/install/output overrides

Required env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID
`);
  process.exit(0);
}

const args = parseArgs(argv);

if (!args.clearOverrides && Object.keys(args.patch).length === 0) {
  fail("No settings specified. Pass at least one option or --clear-overrides.");
}

// Load env values from local files, then process.env (process.env wins).
const localValues = {
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/web/.env.local")),
  ...process.env,
};

const linked = readVercelLink();

const token = localValues.VERCEL_TOKEN ?? "";
const projectId = localValues.VERCEL_PROJECT_ID ?? linked?.projectId ?? "";
const teamId = localValues.VERCEL_ORG_ID ?? linked?.orgId ?? "";

if (!token) fail("VERCEL_TOKEN is not set. Add it to Doppler or .env.local.");
if (!projectId) fail("VERCEL_PROJECT_ID is not set and .vercel/project.json is missing.");

// Build the PATCH body.
const body = { ...args.patch };

if (args.clearOverrides) {
  body.buildCommand = null;
  body.installCommand = null;
  body.outputDirectory = null;
}

info(`Updating Vercel project settings for project ${projectId}...`);
info(`Patch: ${JSON.stringify(body, null, 2)}`);

try {
  const updated = await patchVercelProject(token, projectId, teamId, body);
  info(`PASS Project updated: ${updated.name ?? projectId}`);

  if ("rootDirectory" in body) {
    info(`  rootDirectory  → ${body.rootDirectory ?? "(cleared)"}`);
  }
  if ("buildCommand" in body) {
    info(`  buildCommand   → ${body.buildCommand ?? "(cleared)"}`);
  }
  if ("installCommand" in body) {
    info(`  installCommand → ${body.installCommand ?? "(cleared)"}`);
  }
  if ("outputDirectory" in body) {
    info(`  outputDirectory→ ${body.outputDirectory ?? "(cleared)"}`);
  }
} catch (error) {
  fail(error.message);
}
