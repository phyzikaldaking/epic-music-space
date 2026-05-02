import process from "node:process";
import { runSmoke } from "./smoke.mjs";

const defaultThresholds = {
  warnFailureRate: Number(process.env.SYNTH_WARN_FAILURE_RATE ?? 0.05),
  hardFailureRate: Number(process.env.SYNTH_HARD_FAILURE_RATE ?? 0.15),
  warnP95Ms: Number(process.env.SYNTH_WARN_P95_MS ?? 900),
  hardP95Ms: Number(process.env.SYNTH_HARD_P95_MS ?? 1800),
};

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

async function sendAlert(payload) {
  const webhook = process.env.RELIABILITY_ALERT_WEBHOOK_URL ?? process.env.AUTH_ALERT_WEBHOOK_URL;
  if (!webhook) return;

  await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function main() {
  const report = await runSmoke();

  const failureRate = report.failed.length / Math.max(1, report.results.length);
  const p95LatencyMs = percentile(
    report.results.filter((r) => r.status > 0).map((r) => r.elapsedMs),
    95,
  );

  const hardBreached =
    failureRate >= defaultThresholds.hardFailureRate || p95LatencyMs >= defaultThresholds.hardP95Ms;
  const warnBreached =
    failureRate >= defaultThresholds.warnFailureRate || p95LatencyMs >= defaultThresholds.warnP95Ms;

  const summary = {
    service: "epic-music-space/web",
    event: "synthetics_threshold_evaluation",
    ts: new Date().toISOString(),
    severity: hardBreached ? "critical" : warnBreached ? "warning" : "info",
    meta: {
      baseUrl: report.baseUrl,
      failureRate,
      p95LatencyMs,
      failedChecks: report.failed.map((c) => c.name),
      thresholds: defaultThresholds,
    },
  };

  if (warnBreached) {
    console.error("Synthetics threshold breached", summary.meta);
    try {
      await sendAlert(summary);
    } catch (error) {
      console.error("Failed to send synthetic alert", error);
    }
  } else {
    console.log("Synthetics within thresholds", summary.meta);
  }

  if (!report.passed || hardBreached) {
    process.exit(1);
  }
}

void main();
