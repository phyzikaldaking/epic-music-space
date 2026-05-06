type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type CriticalEnvSeverity = "error" | "warning";

export interface CriticalEnvIssue {
  code: string;
  message: string;
  severity: CriticalEnvSeverity;
}

export interface CriticalEnvReport {
  envName: string;
  isProductionLike: boolean;
  issues: CriticalEnvIssue[];
}

export interface CriticalEnvHealthReport extends CriticalEnvReport {
  status: "ok" | "degraded" | "down";
}

function readEnv(env: EnvSource, key: string) {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasUrl(value: string) {
  return /^https?:\/\//.test(value);
}

export function validateCriticalEnvironment(env: EnvSource = process.env): CriticalEnvReport {
  const envName = readEnv(env, "VERCEL_ENV") || readEnv(env, "NODE_ENV") || "unknown";
  const isProductionLike = readEnv(env, "VERCEL_ENV") === "production";
  const issues: CriticalEnvIssue[] = [];

  const addIssue = (severity: CriticalEnvSeverity, code: string, message: string) => {
    issues.push({ code, message, severity });
  };

  const requiredProductionKeys = [
    "DATABASE_URL",
    "DIRECT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AUTH_SECRET",
    "CRON_SECRET",
    "INTERNAL_API_TOKEN",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "REDIS_URL",
  ] as const;

  if (isProductionLike) {
    for (const key of requiredProductionKeys) {
      if (!readEnv(env, key)) {
        addIssue("error", `missing_${key.toLowerCase()}`, `${key} is required in production.`);
      }
    }
  }

  const siteUrl = readEnv(env, "NEXT_PUBLIC_SITE_URL") || readEnv(env, "NEXT_PUBLIC_APP_URL");
  if (!siteUrl) {
    if (isProductionLike) {
      addIssue("error", "missing_site_url", "NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL is required in production.");
    }
  } else if (!hasUrl(siteUrl)) {
    addIssue("error", "invalid_site_url", "NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL must be an absolute http(s) URL.");
  }

  const supabaseUrl = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  if (supabaseUrl && !hasUrl(supabaseUrl)) {
    addIssue("error", "invalid_supabase_url", "NEXT_PUBLIC_SUPABASE_URL must be an absolute http(s) URL.");
  }

  const livekitValues = [
    readEnv(env, "LIVEKIT_API_KEY"),
    readEnv(env, "LIVEKIT_API_SECRET"),
    readEnv(env, "NEXT_PUBLIC_LIVEKIT_URL"),
  ];
  if (livekitValues.some(Boolean) && !livekitValues.every(Boolean)) {
    addIssue("warning", "partial_livekit_config", "LiveKit configuration is only partially set.");
  }

  const muxValues = [
    readEnv(env, "MUX_TOKEN_ID"),
    readEnv(env, "MUX_TOKEN_SECRET"),
  ];
  if (muxValues.some(Boolean) && !muxValues.every(Boolean)) {
    addIssue("warning", "partial_mux_config", "Mux configuration is only partially set.");
  }

  const googleValues = [
    readEnv(env, "GOOGLE_CLIENT_ID"),
    readEnv(env, "GOOGLE_CLIENT_SECRET"),
  ];
  if (googleValues.some(Boolean) && !googleValues.every(Boolean)) {
    addIssue("warning", "partial_google_oauth_config", "Google OAuth configuration is only partially set.");
  }

  const twilioValues = [
    readEnv(env, "TWILIO_ACCOUNT_SID"),
    readEnv(env, "TWILIO_AUTH_TOKEN"),
    readEnv(env, "TWILIO_VERIFY_FROM"),
  ];
  if (twilioValues.some(Boolean) && !twilioValues.every(Boolean)) {
    addIssue("warning", "partial_phone_auth_config", "Phone OTP configuration is only partially set.");
  }

  if (isProductionLike && !readEnv(env, "SOCIAL_ENCRYPTION_KEY")) {
    addIssue(
      "warning",
      "missing_social_encryption_key",
      "SOCIAL_ENCRYPTION_KEY is not set; connected account tokens cannot be stored securely.",
    );
  }

  if (!readEnv(env, "REDIS_URL")) {
    addIssue(
      isProductionLike ? "error" : "warning",
      "missing_redis_url",
      "REDIS_URL is not configured; production rate limits and queues must be shared across instances.",
    );
  }

  return { envName, isProductionLike, issues };
}

export function assertCriticalEnvironment(
  env: EnvSource = process.env,
  options: { productionOnly?: boolean } = {},
) {
  const report = validateCriticalEnvironment(env);
  if (options.productionOnly && !report.isProductionLike) {
    return report;
  }

  const errors = report.issues.filter((issue) => issue.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Invalid runtime configuration: ${errors.map((issue) => issue.message).join("; ")}`,
    );
  }

  return report;
}

export function getCriticalEnvironmentHealthReport(
  env: EnvSource = process.env,
): CriticalEnvHealthReport {
  const report = validateCriticalEnvironment(env);
  const errors = report.issues.filter((issue) => issue.severity === "error");

  return {
    ...report,
    status: errors.length > 0 ? "down" : report.issues.length > 0 ? "degraded" : "ok",
  };
}
