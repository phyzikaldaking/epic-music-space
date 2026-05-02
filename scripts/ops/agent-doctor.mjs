import path from "node:path";
import {
  commandExists,
  deriveGitHubRepository,
  fileExists,
  getOriginUrl,
  loadEnvFile,
  readVercelLink,
  repoRoot,
  resolveOpsMetadata,
  runToolCommand,
  summarizeStatus,
} from "./lib.mjs";
import {
  controlPlaneKeys,
  optionalRequirements,
  serviceRequirements,
} from "./config.mjs";

const localValues = {
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/web/.env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/api/.env")),
};

const metadata = resolveOpsMetadata(localValues);

const commandChecks = [
  { name: "gh", label: "GitHub CLI", authArgs: ["auth", "status"], optional: true },
  { name: "vercel", label: "Vercel CLI", authArgs: ["whoami"], optional: true },
  { name: "supabase", label: "Supabase CLI", authArgs: ["projects", "list"], optional: true },
  { name: "stripe", label: "Stripe CLI", authArgs: ["config", "--list"], optional: true },
  { name: "doppler", label: "Doppler CLI", authArgs: ["me"], optional: true },
  { name: "op", label: "1Password CLI", authArgs: ["account", "list"], optional: true },
];

let hasFailure = false;
let hasOptionalToolingGap = false;

console.log("Epic Music Space agent doctor");
console.log("");

for (const check of commandChecks) {
  const hasDirectBinary = commandExists(check.name);
  const result = runToolCommand(check.name, check.authArgs);
  if (result.error?.code === "ENOENT") {
    summarizeStatus(
      check.label,
      check.optional ? "warn" : false,
      check.optional ? "optional - not installed" : "not installed",
    );
    if (check.optional) {
      hasOptionalToolingGap = true;
    } else {
      hasFailure = true;
    }
    continue;
  }

  const toolingOk = result.ok;
  summarizeStatus(
    check.label,
    toolingOk ? true : check.optional ? "warn" : false,
    toolingOk
      ? hasDirectBinary
        ? "installed and authenticated"
        : "available via npx and authenticated"
      : hasDirectBinary
        ? check.optional
          ? "optional - installed but needs login"
          : "installed but needs login"
        : check.optional
          ? "optional - available via npx but needs login"
          : "available via npx but needs login",
  );

  if (!toolingOk) {
    if (check.optional) {
      hasOptionalToolingGap = true;
    } else {
      hasFailure = true;
    }
  }
}

console.log("");

const originUrl = getOriginUrl();
summarizeStatus(
  "Git remote",
  Boolean(originUrl),
  originUrl ?? "origin remote missing",
);
if (!originUrl) hasFailure = true;

const repository = localValues.GITHUB_REPOSITORY ?? deriveGitHubRepository(originUrl);
summarizeStatus(
  "GitHub repository",
  Boolean(repository),
  repository ?? "set GITHUB_REPOSITORY in Doppler",
);
if (!repository) hasFailure = true;

const vercelLink = readVercelLink();
summarizeStatus(
  "Vercel link",
  Boolean(vercelLink?.projectId && vercelLink?.orgId),
  vercelLink
    ? `project=${vercelLink.projectName ?? vercelLink.projectId}`
    : ".vercel/project.json missing",
);
if (!vercelLink?.projectId || !vercelLink?.orgId) hasFailure = true;

for (const file of [".env.local", "apps/web/.env.local", "apps/api/.env"]) {
  const absolutePath = path.join(repoRoot, file);
  summarizeStatus(file, fileExists(absolutePath), fileExists(absolutePath) ? "present" : "missing");
}

console.log("");

for (const [service, keys] of Object.entries(serviceRequirements)) {
  let missing = keys.filter((key) => !(key in localValues) || String(localValues[key]).trim() === "");

  if (service === "GitHub" && repository) {
    missing = [];
  }

  if (service === "Vercel" && metadata.vercelOrgId && metadata.vercelProjectId) {
    missing = [];
  }

  summarizeStatus(
    `${service} env`,
    missing.length === 0,
    missing.length === 0 ? `${keys.length}/${keys.length} set` : `missing ${missing.join(", ")}`,
  );

  if (missing.length > 0) hasFailure = true;
}

const missingControlPlane = controlPlaneKeys.filter((key) => {
  if (key === "SUPABASE_PROJECT_REF") return !metadata.supabaseProjectRef;
  if (key === "GITHUB_REPOSITORY") return !repository;
  if (key === "VERCEL_ORG_ID") return !metadata.vercelOrgId;
  if (key === "VERCEL_PROJECT_ID") return !metadata.vercelProjectId;
  return !(key in localValues) || String(localValues[key]).trim() === "";
});

summarizeStatus(
  "Control-plane metadata",
  missingControlPlane.length === 0,
  missingControlPlane.length === 0
    ? "ready for env sync"
    : `missing ${missingControlPlane.join(", ")}`,
);
if (missingControlPlane.length > 0) hasFailure = true;

for (const [service, keys] of Object.entries(optionalRequirements)) {
  const missing = keys.filter((key) => !(key in localValues) || String(localValues[key]).trim() === "");
  summarizeStatus(
    `${service} env`,
    missing.length === 0,
    missing.length === 0 ? "enabled" : `optional missing ${missing.join(", ")}`,
  );
}

if (hasFailure) {
  process.exit(1);
}

if (hasOptionalToolingGap) {
  console.log("");
  console.log("Optional tooling gaps remain, but core app/env setup is ready.");
}
