import path from "node:path";
import {
  fetchDopplerSecrets,
  loadEnvFile,
  repoRoot,
  resolveOpsMetadata,
  summarizeStatus,
} from "./lib.mjs";
import {
  dopplerConfigs,
  optionalRequirements,
  serviceRequirements,
} from "./config.mjs";

const localValues = {
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/web/.env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/api/.env")),
};

function reportEnvironment(label, values) {
  const metadata = resolveOpsMetadata(values);
  let ok = true;

  console.log(label);

  for (const [service, keys] of Object.entries(serviceRequirements)) {
    let missing = keys.filter((key) => !(key in values) || String(values[key]).trim() === "");

    if (service === "GitHub" && metadata.repository) {
      missing = [];
    }

    if (service === "Vercel" && metadata.vercelOrgId && metadata.vercelProjectId) {
      missing = [];
    }

    summarizeStatus(
      service,
      missing.length === 0,
      missing.length === 0 ? `${keys.length}/${keys.length} set` : `missing ${missing.join(", ")}`,
    );

    if (missing.length > 0) ok = false;
  }

  for (const [service, keys] of Object.entries(optionalRequirements)) {
    const missing = keys.filter((key) => !(key in values) || String(values[key]).trim() === "");
    summarizeStatus(
      service,
      missing.length === 0,
      missing.length === 0 ? "enabled" : `optional missing ${missing.join(", ")}`,
    );
  }

  console.log("");
  return ok;
}

let allOk = true;

try {
  for (const configName of dopplerConfigs) {
    const values = fetchDopplerSecrets(configName, { throwOnError: true });
    if (!reportEnvironment(`Doppler config: ${configName}`, values)) {
      allOk = false;
    }
  }
} catch (error) {
  console.warn(
    "WARN: Doppler configs could not be checked. Falling back to local env files only.",
  );
  if (!reportEnvironment("Local files: .env.local + apps/web/.env.local + apps/api/.env", localValues)) {
    allOk = false;
  }
}

if (!allOk) {
  process.exit(1);
}
