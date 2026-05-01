import {
  deriveGitHubRepository,
  fetchDopplerSecrets,
  fail,
  info,
  missingKeys,
  resolveOpsMetadata,
  runToolCommand,
} from "./lib.mjs";
import {
  getDopplerConfigName,
  githubSecretKeys,
  serviceRequirements,
  vercelEnvKeys,
} from "./config.mjs";

const environment = process.argv[2];

if (!environment || !["preview", "prod"].includes(environment)) {
  fail("usage: node scripts/ops/env-push.mjs <preview|prod>");
}

const configName = getDopplerConfigName(environment);
const values = fetchDopplerSecrets(configName);
const requiredKeys = Object.values(serviceRequirements).flat();
const missing = missingKeys(values, requiredKeys);

if (missing.length > 0) {
  fail(`Doppler config "${configName}" is missing: ${missing.join(", ")}`);
}

const metadata = resolveOpsMetadata(values);
const repository = values.GITHUB_REPOSITORY ?? metadata.repository ?? deriveGitHubRepository();

if (!repository) {
  fail("GITHUB_REPOSITORY is not set and could not be derived from git remote");
}

const vercelEnvironment = environment === "prod" ? "production" : "preview";
let hadFailure = false;

if (process.env.EMS_SKIP_VERCEL_SYNC !== "1") {
  info(`Syncing ${vercelEnvKeys.length} env vars to Vercel (${vercelEnvironment})...`);

  for (const key of vercelEnvKeys) {
    if (!(key in values) || String(values[key]).trim() === "") continue;

    runToolCommand("vercel", ["env", "rm", key, vercelEnvironment, "--yes"]);
    const addResult = runToolCommand(
      "vercel",
      ["env", "add", key, vercelEnvironment],
      { input: `${values[key]}\n` },
    );

    if (!addResult.ok) {
      console.error(`FAIL Vercel env sync for ${key}: ${addResult.stderr.trim() || addResult.stdout.trim()}`);
      hadFailure = true;
      continue;
    }

    info(`PASS Vercel ${key}`);
  }
}

if (process.env.EMS_SKIP_GITHUB_SYNC !== "1") {
  info(`Syncing ${githubSecretKeys.length} env vars to GitHub (${repository})...`);

  for (const key of githubSecretKeys) {
    if (!(key in values) || String(values[key]).trim() === "") continue;

    const result = runToolCommand("gh", [
      "secret",
      "set",
      key,
      "--repo",
      repository,
      "--body",
      String(values[key]),
    ]);

    if (!result.ok) {
      console.error(`FAIL GitHub secret sync for ${key}: ${result.stderr.trim() || result.stdout.trim()}`);
      hadFailure = true;
      continue;
    }

    info(`PASS GitHub ${key}`);
  }
}

if (hadFailure) {
  process.exit(1);
}
