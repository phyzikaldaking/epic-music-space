/**
 * Boot-time configuration guard.
 *
 * Prior incident: GOOGLE_CLIENT_ID was set to "" in production for an
 * unknown amount of time, breaking sign-in silently. This module catches
 * the same class of failure at cold-start by validating every required
 * env key, including placeholder detection.
 *
 * Invoked exactly once from the root layout (server-side). On Vercel,
 * each fluid-compute instance evaluates this on cold start, so a
 * misconfiguration crashes the function loudly instead of degrading
 * silently to an OAuth `redirect_uri_mismatch` later.
 */

type Severity = "required" | "recommended";

interface EnvCheck {
  key: string;
  severity: Severity;
  /** Optional regex the value must match (after non-empty + non-placeholder check). */
  pattern?: RegExp;
  /** What this key powers — surfaced in errors so the operator knows what breaks. */
  purpose: string;
}

const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /changeme/i,
  /^placeholder/i,
  /^xxx+$/i,
  /^todo/i,
  /^example\./i,
  /\.example\.com/i,
];

const CHECKS: EnvCheck[] = [
  {
    key: "DATABASE_URL",
    severity: "required",
    pattern: /^postgres(ql)?:\/\//,
    purpose: "Postgres connection — every database read/write fails without it",
  },
  {
    key: "NEXTAUTH_URL",
    severity: "required",
    pattern: /^https?:\/\//,
    purpose: "OAuth callback base — sign-in redirects break if wrong/missing",
  },
  {
    key: "NEXTAUTH_SECRET",
    severity: "required",
    purpose: "Session JWT signing key — sessions can't be issued without it",
  },
  {
    key: "GOOGLE_CLIENT_ID",
    severity: "required",
    pattern: /\.apps\.googleusercontent\.com$/,
    purpose: "Google sign-in — without it the OAuth flow returns invalid_client",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    severity: "required",
    pattern: /^GOCSPX-/,
    purpose: "Google sign-in — without it the OAuth flow returns invalid_client",
  },
  {
    key: "STRIPE_SECRET_KEY",
    severity: "required",
    pattern: /^sk_(test|live)_/,
    purpose: "Stripe API — every checkout/payout/webhook handler fails without it",
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    severity: "required",
    pattern: /^whsec_/,
    purpose: "Stripe webhook signature verification — webhook handler 400s without it",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    severity: "required",
    pattern: /^https:\/\/[a-z0-9]+\.supabase\.co/,
    purpose: "Supabase realtime + storage URL",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    severity: "required",
    purpose: "Supabase realtime + storage anon key",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    severity: "required",
    purpose: "Server-side Supabase mutations (signed uploads, etc.)",
  },
  {
    key: "APPLE_CLIENT_ID",
    severity: "recommended",
    purpose: "Apple sign-in — flow falls back to Google-only without it",
  },
  {
    key: "APPLE_CLIENT_SECRET",
    severity: "recommended",
    purpose: "Apple sign-in — flow falls back to Google-only without it",
  },
  {
    key: "REPLICATE_API_TOKEN",
    severity: "recommended",
    purpose: "Demucs stem separation — /studio/board?stems= and /track 'Open in Studio' fail without it",
  },
  {
    key: "REPLICATE_WEBHOOK_SECRET",
    severity: "recommended",
    purpose: "Replicate webhook signature verification — required in prod, optional locally",
  },
  {
    key: "PAYPAL_CLIENT_ID",
    severity: "recommended",
    purpose: "PayPal checkout for services — buyers who prefer PayPal cannot pay without it",
  },
  {
    key: "PAYPAL_CLIENT_SECRET",
    severity: "recommended",
    purpose: "PayPal checkout for services — server-side capture cannot complete without it",
  },
];

export interface EnvIssue {
  key: string;
  severity: Severity;
  reason: "missing" | "empty" | "placeholder" | "pattern";
  purpose: string;
}

export function inspectEnv(env: Record<string, string | undefined> = process.env): EnvIssue[] {
  const issues: EnvIssue[] = [];
  for (const check of CHECKS) {
    const raw = env[check.key];
    if (raw === undefined) {
      issues.push({ ...check, reason: "missing" });
      continue;
    }
    const value = raw.trim();
    if (value === "") {
      issues.push({ ...check, reason: "empty" });
      continue;
    }
    if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
      issues.push({ ...check, reason: "placeholder" });
      continue;
    }
    if (check.pattern && !check.pattern.test(value)) {
      issues.push({ ...check, reason: "pattern" });
      continue;
    }
  }
  return issues;
}

let validated = false;

/**
 * Run once at server startup. Throws on missing/invalid required keys
 * in production. In dev, logs a one-line warning and continues so a
 * fresh clone can still boot before .env.local is filled in.
 */
export function assertRequiredEnvOnBoot(): void {
  if (validated) return;
  validated = true;

  const issues = inspectEnv();
  if (issues.length === 0) return;

  const required = issues.filter((i) => i.severity === "required");
  const recommended = issues.filter((i) => i.severity === "recommended");
  // Enforce hard boot failures only for real production deploys by default.
  // Local smoke runs often execute in NODE_ENV=production without a full
  // secrets set, and should degrade to warnings instead of universal 500s.
  // Set REQUIRED_ENV_STRICT=1 to force strict behavior outside production.
  const isStrictMode =
    process.env.VERCEL_ENV === "production" ||
    process.env.REQUIRED_ENV_STRICT === "1";

  // Single-line summary first — easy to grep in logs.
  console.error(
    `[requiredEnv] ${required.length} required + ${recommended.length} recommended issue(s) detected`,
  );

  for (const issue of issues) {
    const tag = issue.severity === "required" ? "[required]" : "[recommended]";
    const verb =
      issue.reason === "missing"
        ? "is not set"
        : issue.reason === "empty"
          ? "is set but empty"
          : issue.reason === "placeholder"
            ? "still holds a placeholder value"
            : "does not match its expected format";
    console.error(`  ${tag} ${issue.key} ${verb} — ${issue.purpose}`);
  }

  if (isStrictMode && required.length > 0) {
    throw new Error(
      `[requiredEnv] ${required.length} required env var(s) missing or invalid. ` +
        `Failing the cold start so the misconfiguration is loud, not silent. ` +
        `Keys: ${required.map((i) => i.key).join(", ")}`,
    );
  }
}

/**
 * Public-safe summary for the admin /api/health/config endpoint.
 * Never returns secret values — only presence flags + the (public)
 * NEXTAUTH_URL value, which is the user-facing sign-in domain.
 */
export function summarizeEnvForHealthCheck(env: Record<string, string | undefined> = process.env) {
  const checks = CHECKS.map((c) => {
    const raw = env[c.key];
    const value = (raw ?? "").trim();
    const issue = inspectEnv(env).find((i) => i.key === c.key);
    return {
      key: c.key,
      severity: c.severity,
      present: value !== "",
      issue: issue?.reason ?? null,
      // NEXTAUTH_URL is public domain info — fine to surface so an operator
      // can confirm the OAuth callback base is what they expect.
      value: c.key === "NEXTAUTH_URL" ? value || null : undefined,
    };
  });
  return {
    ok: checks.every((c) => c.severity === "recommended" || (c.present && !c.issue)),
    nodeEnv: env.NODE_ENV ?? "unknown",
    onVercel: Boolean(env.VERCEL),
    checks,
  };
}
