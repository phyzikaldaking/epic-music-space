import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "apps/web");
const manifestPath = path.join(webRoot, ".next/app-build-manifest.json");

const routeBudgets = {
  "/": Number(process.env.PERF_BUDGET_HOME_KB ?? 40),
  "/marketplace": Number(process.env.PERF_BUDGET_MARKETPLACE_KB ?? 60),
  "/radar": Number(process.env.PERF_BUDGET_RADAR_KB ?? 30),
  "/trending": Number(process.env.PERF_BUDGET_TRENDING_KB ?? 30),
  "/admin/ops": Number(process.env.PERF_BUDGET_ADMIN_OPS_KB ?? 30),
  "/admin/risk": Number(process.env.PERF_BUDGET_ADMIN_RISK_KB ?? 30),
};

const latencyBudgets = {
  "/": Number(process.env.PERF_LATENCY_HOME_MS ?? 900),
  "/marketplace": Number(process.env.PERF_LATENCY_MARKETPLACE_MS ?? 1200),
  "/radar": Number(process.env.PERF_LATENCY_RADAR_MS ?? 1200),
  "/api/health/ready": Number(process.env.PERF_LATENCY_READY_MS ?? 600),
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function bytesForManifestFile(file) {
  const staticPath = path.join(webRoot, ".next/static", file.replace(/^static\//, ""));
  if (fs.existsSync(staticPath)) return fs.statSync(staticPath).size;
  const nextPath = path.join(webRoot, ".next", file);
  if (fs.existsSync(nextPath)) return fs.statSync(nextPath).size;
  return 0;
}

function routeKey(route) {
  if (route === "/") return "/page";
  return `${route}/page`;
}

function routeChunkFiles(route) {
  const routeDir = route === "/" ? "" : route.replace(/^\//, "");
  const chunkDir = path.join(webRoot, ".next/static/chunks/app", routeDir);
  if (!fs.existsSync(chunkDir)) return [];
  return fs
    .readdirSync(chunkDir)
    .filter((file) => /^page-[a-f0-9]+\.js$/.test(file))
    .map((file) => path.join(chunkDir, file));
}

function checkBundleBudgets() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}. Run web build before perf budget checks.`);
  }

  const manifest = readJson(manifestPath);
  const pages = manifest.pages ?? {};
  const failures = [];
  const results = [];

  for (const [route, budgetKb] of Object.entries(routeBudgets)) {
    const routeFiles = routeChunkFiles(route);
    const files = pages[routeKey(route)] ?? pages[route] ?? [];
    if (routeFiles.length === 0 && files.length === 0) {
      results.push({ route, skipped: true, reason: "not in app build manifest" });
      continue;
    }
    const totalBytes =
      routeFiles.length > 0
        ? routeFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0)
        : files.reduce((sum, file) => sum + bytesForManifestFile(file), 0);
    const totalKb = Math.ceil(totalBytes / 1024);
    results.push({ route, totalKb, budgetKb });
    if (totalKb > budgetKb) {
      failures.push(`${route}: ${totalKb}KB > ${budgetKb}KB`);
    }
  }

  console.log("Bundle budgets:", results);
  if (results.every((result) => result.skipped)) {
    failures.push("No budgeted routes were found in app-build-manifest.json");
  }
  return failures;
}

async function checkLatencyBudgets(baseUrl) {
  const failures = [];
  const results = [];
  for (const [route, budgetMs] of Object.entries(latencyBudgets)) {
    const startedAt = Date.now();
    let status = 0;
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}${route}`, {
        redirect: "manual",
        cache: "no-store",
      });
      status = res.status;
      await res.arrayBuffer();
    } catch (error) {
      failures.push(`${route}: request failed (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    const elapsedMs = Date.now() - startedAt;
    results.push({ route, status, elapsedMs, budgetMs });
    if (status >= 500 && status !== 503) failures.push(`${route}: status ${status}`);
    if (elapsedMs > budgetMs) failures.push(`${route}: ${elapsedMs}ms > ${budgetMs}ms`);
  }
  console.log("Latency budgets:", results);
  return failures;
}

const failures = checkBundleBudgets();
const baseUrl = process.env.PERF_BASE_URL ?? process.env.SYNTHETICS_BASE_URL;
if (baseUrl) {
  failures.push(...(await checkLatencyBudgets(baseUrl)));
}

if (failures.length > 0) {
  console.error("Performance budgets failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Performance budgets passed.");
