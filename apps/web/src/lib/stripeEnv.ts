type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type StripeKeyMode = "live" | "test" | "unknown" | "missing";
export type StripeValidationSeverity = "error" | "warning";

export interface StripeValidationIssue {
  code: string;
  message: string;
  severity: StripeValidationSeverity;
}

export interface StripeValidationReport {
  envName: string;
  isProductionLike: boolean;
  issues: StripeValidationIssue[];
  publishableKeyMode: StripeKeyMode;
  secretKeyMode: StripeKeyMode;
}

export interface StripeHealthReport extends StripeValidationReport {
  latencyMs?: number;
  message?: string;
  status: "ok" | "degraded" | "down" | "not_configured";
}

const SUBSCRIPTION_PRICE_ENV_KEYS = [
  "STRIPE_PRICE_ID_STARTER",
  "STRIPE_PRICE_ID_PRO",
  "STRIPE_PRICE_ID_PRIME",
  "STRIPE_PRICE_ID_TEAM",
  "STRIPE_PRICE_ID_LABEL",
] as const;

function readEnv(env: EnvSource, key: string) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function detectKeyMode(value: string, prefixes: { live: string; test: string }): StripeKeyMode {
  if (!value) return "missing";
  if (value.startsWith(prefixes.live)) return "live";
  if (value.startsWith(prefixes.test)) return "test";
  return "unknown";
}

function getEnvName(env: EnvSource) {
  return readEnv(env, "VERCEL_ENV") || readEnv(env, "NODE_ENV") || "unknown";
}

export function validateStripeEnvironment(env: EnvSource = process.env): StripeValidationReport {
  const issues: StripeValidationIssue[] = [];
  const secretKey = readEnv(env, "STRIPE_SECRET_KEY");
  const publishableKey = readEnv(env, "STRIPE_PUBLISHABLE_KEY");
  const webhookSecret = readEnv(env, "STRIPE_WEBHOOK_SECRET");
  const envName = getEnvName(env);
  const isProductionLike = readEnv(env, "VERCEL_ENV") === "production";
  const secretKeyMode = detectKeyMode(secretKey, { live: "sk_live_", test: "sk_test_" });
  const publishableKeyMode = detectKeyMode(publishableKey, { live: "pk_live_", test: "pk_test_" });

  const addIssue = (
    severity: StripeValidationSeverity,
    code: string,
    message: string,
  ) => {
    issues.push({ code, message, severity });
  };

  if (!secretKey) {
    addIssue("error", "missing_secret_key", "STRIPE_SECRET_KEY is required.");
  } else if (secretKeyMode === "unknown") {
    addIssue(
      "error",
      "invalid_secret_key_format",
      "STRIPE_SECRET_KEY must start with sk_live_ or sk_test_.",
    );
  }

  if (!publishableKey) {
    addIssue("error", "missing_publishable_key", "STRIPE_PUBLISHABLE_KEY is required.");
  } else if (publishableKeyMode === "unknown") {
    addIssue(
      "error",
      "invalid_publishable_key_format",
      "STRIPE_PUBLISHABLE_KEY must start with pk_live_ or pk_test_.",
    );
  }

  if (!webhookSecret) {
    addIssue(
      isProductionLike ? "error" : "warning",
      "missing_webhook_secret",
      isProductionLike
        ? "STRIPE_WEBHOOK_SECRET is required."
        : "STRIPE_WEBHOOK_SECRET is not configured; webhook fulfillment is disabled outside production.",
    );
  } else if (!webhookSecret.startsWith("whsec_")) {
    addIssue(
      "error",
      "invalid_webhook_secret_format",
      "STRIPE_WEBHOOK_SECRET must start with whsec_.",
    );
  }

  for (const key of SUBSCRIPTION_PRICE_ENV_KEYS) {
    const value = readEnv(env, key);
    if (!value) {
      if (isProductionLike) {
        addIssue("error", `missing_${key.toLowerCase()}`, `${key} is required in production.`);
      }
      continue;
    }

    if (!value.startsWith("price_")) {
      addIssue(
        "error",
        `invalid_${key.toLowerCase()}_format`,
        `${key} must start with price_.`,
      );
    }
  }

  if (
    secretKeyMode !== "missing" &&
    publishableKeyMode !== "missing" &&
    secretKeyMode !== "unknown" &&
    publishableKeyMode !== "unknown" &&
    secretKeyMode !== publishableKeyMode
  ) {
    addIssue(
      "error",
      "key_mode_mismatch",
      "STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must both be live keys or both be test keys.",
    );
  }

  if (isProductionLike) {
    if (secretKeyMode === "test") {
      addIssue(
        "error",
        "test_secret_in_production",
        "Production must use a live STRIPE_SECRET_KEY, not an sk_test_ key.",
      );
    }
    if (publishableKeyMode === "test") {
      addIssue(
        "error",
        "test_publishable_in_production",
        "Production must use a live STRIPE_PUBLISHABLE_KEY, not a pk_test_ key.",
      );
    }
  } else {
    if (secretKeyMode === "live") {
      addIssue(
        "warning",
        "live_secret_outside_production",
        `${envName} is using a live STRIPE_SECRET_KEY.`,
      );
    }
    if (publishableKeyMode === "live") {
      addIssue(
        "warning",
        "live_publishable_outside_production",
        `${envName} is using a live STRIPE_PUBLISHABLE_KEY.`,
      );
    }
  }

  return {
    envName,
    isProductionLike,
    issues,
    publishableKeyMode,
    secretKeyMode,
  };
}

export function assertStripeEnvironment(
  env: EnvSource = process.env,
  options: { productionOnly?: boolean } = {},
) {
  const report = validateStripeEnvironment(env);
  if (options.productionOnly && !report.isProductionLike) {
    return report;
  }
  const errors = report.issues.filter((issue) => issue.severity === "error");

  if (errors.length > 0) {
    throw new Error(
      `Invalid Stripe configuration: ${errors.map((issue) => issue.message).join("; ")}`,
    );
  }

  return report;
}

export async function getStripeHealthReport(
  env: EnvSource = process.env,
): Promise<StripeHealthReport> {
  const report = validateStripeEnvironment(env);
  const errors = report.issues.filter((issue) => issue.severity === "error");

  if (!readEnv(env, "STRIPE_SECRET_KEY")) {
    return {
      ...report,
      status: errors.length > 0 ? "down" : "not_configured",
      message: errors[0]?.message,
    };
  }

  if (errors.length > 0) {
    return {
      ...report,
      status: "down",
      message: errors[0]?.message,
    };
  }

  const startedAt = Date.now();

  try {
    const { stripe } = await import("@/lib/stripe");
    await stripe.balance.retrieve();

    return {
      ...report,
      latencyMs: Date.now() - startedAt,
      message: report.issues[0]?.message,
      status: report.issues.length > 0 ? "degraded" : "ok",
    };
  } catch (error) {
    return {
      ...report,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
      status: "down",
    };
  }
}
