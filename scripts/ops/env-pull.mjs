import {
  fetchDopplerSecrets,
  info,
  missingKeys,
  writeEnvFile,
} from "./lib.mjs";
import {
  getDopplerConfigName,
  localEnvTargets,
  serviceRequirements,
} from "./config.mjs";

const configName = getDopplerConfigName("dev");
const values = fetchDopplerSecrets(configName);
const requiredKeys = Object.values(serviceRequirements).flat();
const missing = missingKeys(values, requiredKeys);

if (missing.length > 0) {
  console.error(`ERROR: Doppler config "${configName}" is missing: ${missing.join(", ")}`);
  process.exit(1);
}

for (const target of localEnvTargets) {
  writeEnvFile(target.filePath, target.keys, values, `${target.title} (${configName})`);
  info(`Wrote ${target.filePath}`);
}
