// Trigger a Vercel redeploy.
//
// Usage:
//   node scripts/ops/vercel-redeploy.mjs [options]
//
// Options:
//   --prod                  Promote the redeployment to production
//   --deployment <url|id>   Redeploy a specific deployment (default: latest)
//
// Required env:
//   VERCEL_TOKEN      Personal or team API token
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
  runToolCommand,
} from "./lib.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextValue(argv, i, flag) {
  const val = argv[i + 1];
  if (val === undefined || val === "" || val.startsWith("--")) {
    fail(`${flag} requires a non-empty value.`);
  }
  return val;
}

function parseArgs(argv) {
  const args = { prod: false, deployment: null };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--prod") {
      args.prod = true;
    } else if (arg === "--deployment") {
      args.deployment = nextValue(argv, i, "--deployment");
      i++;
    } else {
      fail(`Unknown argument: ${arg}\nRun with --help to see usage.`);
    }
    i++;
  }
  return args;
}

async function getLatestDeployment(token, projectId, teamId) {
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("limit", "1");
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
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

  const data = JSON.parse(text);
  const deployment = data?.deployments?.[0];
  if (!deployment) throw new Error("No deployments found for this project.");
  return deployment;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage: node scripts/ops/vercel-redeploy.mjs [options]

Options:
  --prod                  Promote redeployment to production
  --deployment <url|id>   Target a specific deployment (default: latest)

Required env: VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID
`);
  process.exit(0);
}

const args = parseArgs(argv);

// Load env values from local files and process.env.
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

let deploymentRef = args.deployment;

if (!deploymentRef) {
  info("Fetching latest deployment...");
  try {
    const latest = await getLatestDeployment(token, projectId, teamId);
    deploymentRef = latest.url ?? latest.uid;
    info(`Found latest deployment: ${deploymentRef} (state: ${latest.state})`);
  } catch (error) {
    fail(error.message);
  }
}

const cliArgs = ["redeploy", deploymentRef];
if (args.prod) cliArgs.push("--prod");

info(`Redeploying ${deploymentRef}${args.prod ? " (production)" : ""}...`);

const result = runToolCommand("vercel", cliArgs);

if (!result.ok) {
  const detail = result.stderr.trim() || result.stdout.trim() || "unknown error";
  fail(`Vercel redeploy failed: ${detail}`);
}

info("PASS Redeploy triggered.");
if (result.stdout.trim()) {
  info(result.stdout.trim());
}
