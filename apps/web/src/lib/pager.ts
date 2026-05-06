/**
 * Out-of-band paging — sends to AUTH_ALERT_WEBHOOK_URL (Slack/Discord/PagerDuty
 * Events API). Always fire-and-forget: an outage in the pager must never block
 * the request that's reporting it. Returns true if a webhook is configured and
 * the dispatch was queued (not necessarily delivered).
 *
 * Severity is metadata only — it's serialized into the payload so downstream
 * routing (PD priority, Slack channel) can branch. The HTTP call doesn't vary.
 */

export type PageSeverity = "info" | "warn" | "error" | "critical";

export interface PageOptions {
  severity?: PageSeverity;
  /** Short headline shown by Slack as the bold first line. */
  title: string;
  /** Free-form details shown beneath the title. Truncated to 4 KB. */
  body?: string;
  /** Structured context for downstream routing/dashboards. Stringified inline. */
  context?: Record<string, unknown>;
  /** Tag used for de-dup / fingerprint downstream (e.g. PagerDuty dedupKey). */
  fingerprint?: string;
}

const SEVERITY_PREFIX: Record<PageSeverity, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
  critical: "🔥",
};

const MAX_BODY_BYTES = 4_096;

function truncate(value: string, max = MAX_BODY_BYTES) {
  return value.length > max ? `${value.slice(0, max - 12)}… [truncated]` : value;
}

export function page(options: PageOptions): boolean {
  const url = process.env.AUTH_ALERT_WEBHOOK_URL;
  if (!url) return false;

  const severity = options.severity ?? "warn";
  const prefix = SEVERITY_PREFIX[severity];
  const lines: string[] = [`${prefix} *${options.title}*`];
  if (options.body) lines.push(truncate(options.body));
  if (options.context && Object.keys(options.context).length > 0) {
    try {
      lines.push("```\n" + truncate(JSON.stringify(options.context, null, 2)) + "\n```");
    } catch {
      // Non-serializable context shouldn't kill the page.
    }
  }
  const text = lines.join("\n");

  // Slack-compatible payload. PagerDuty Events API v2 webhooks accept
  // arbitrary JSON via Slack-shaped requests when configured as a Slack-style
  // ingestion endpoint, so this works for both targets without branching.
  const payload = {
    text,
    severity,
    fingerprint: options.fingerprint,
    context: options.context,
  };

  // Fire-and-forget. We never await — pagers go down too, and a failed
  // notify must not propagate into the caller's request handling.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // 5 s ceiling; PagerDuty recommends < 10 s for inbound integrations.
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Swallow — already best-effort.
  });

  return true;
}
