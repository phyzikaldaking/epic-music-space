import { spawn } from "node:child_process";

const phase = process.argv[2];
const serviceName = (process.env.RAILWAY_SERVICE_NAME ?? "").trim().toLowerCase();
const allowedProjectId = "d1680973-9823-4b01-a279-c9668fd3fdd3";
const projectId = (process.env.RAILWAY_PROJECT_ID ?? "").trim();

const workers = {
  "ems-notifications-worker": {
    start: "npx tsx apps/web/src/workers/notifications.ts",
  },
  "ems-analytics-worker": {
    start: "npx tsx apps/web/src/workers/analytics.ts",
  },
  "ems-ai-scoring-worker": {
    start: "npx tsx apps/web/src/workers/aiScoring.ts",
  },
};

const worker = workers[serviceName];
const isUnusedProject = projectId && projectId !== allowedProjectId;

if (!["build", "predeploy", "start"].includes(phase)) {
  console.error("[railway] Expected phase: build, predeploy, or start");
  process.exit(2);
}

if (isUnusedProject) {
  console.log(
    `[railway] Project ${process.env.RAILWAY_PROJECT_NAME ?? projectId} is disabled by repository policy; only Railway project ${allowedProjectId} may run.`,
  );
  process.exit(0);
}

let command;
const env = { ...process.env };

if (phase === "build") {
  if (worker) {
    command =
      "npx prisma generate --schema packages/db/prisma/schema.prisma";
  } else {
    const databaseUrl = (
      process.env.DATABASE_URL ??
      process.env.DIRECT_URL ??
      ""
    ).trim();

    if (!databaseUrl) {
      console.error(
        "[railway] Web build stopped before dependency compilation: configure DATABASE_URL (or DIRECT_URL) on the Railway web service before redeploying.",
      );
      process.exit(1);
    }

    env.DATABASE_URL = databaseUrl;
    env.DIRECT_URL = (process.env.DIRECT_URL ?? "").trim() || databaseUrl;

    env.RAILWAY_STANDALONE = "true";
    command =
      "npx prisma generate --schema packages/db/prisma/schema.prisma && unset __NEXT_PRIVATE_STANDALONE_CONFIG __NEXT_PRIVATE_ORIGIN && npm --workspace apps/web run build && mkdir -p apps/web/.next/standalone/apps/web/.next && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && cp -R apps/web/public apps/web/.next/standalone/apps/web/public";
  }
} else if (phase === "predeploy") {
  if (worker) {
    console.log(`[railway] No pre-deploy migration required for ${serviceName}.`);
    process.exit(0);
  }
  command = "npm run db:deploy";
} else {
  command = worker?.start ??
    "HOSTNAME=0.0.0.0 node apps/web/.next/standalone/apps/web/server.js";
}

console.log(`[railway] phase=${phase} service=${serviceName || "web"}`);
const child = spawn(command, {
  env,
  shell: true,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("[railway] Command failed to start", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[railway] Command terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
