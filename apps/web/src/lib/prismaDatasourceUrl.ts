export interface PrismaDatasourceEnv {
  nodeEnv?: string;
  vercel?: string;
  minConnectionLimit?: string;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function resolvePrismaDatasourceUrl(
  rawUrl: string,
  env: PrismaDatasourceEnv = {},
): { normalizedUrl: string; warning?: string } {
  if (!rawUrl) return { normalizedUrl: rawUrl };

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { normalizedUrl: rawUrl };
  }

  const isServerlessVercel =
    env.nodeEnv === "production" && Boolean(env.vercel);
  const minConnectionLimit = isServerlessVercel
    ? 1
    : toInt(env.minConnectionLimit, 5);

  const currentConnectionLimit = Number(parsed.searchParams.get("connection_limit") ?? "");
  const hasConnectionLimit = Number.isFinite(currentConnectionLimit) && currentConnectionLimit > 0;

  if (!hasConnectionLimit) {
    parsed.searchParams.set("connection_limit", String(minConnectionLimit));
  } else if (currentConnectionLimit < minConnectionLimit) {
    parsed.searchParams.set("connection_limit", String(minConnectionLimit));
  }

  const hasPgbouncer =
    parsed.searchParams.get("pgbouncer") === "true" || parsed.port === "6543";

  if (isServerlessVercel && !hasPgbouncer) {
    return {
      normalizedUrl: parsed.toString(),
      warning:
        "[prisma] DATABASE_URL does not look like a transaction pooler URL. Configure Supabase transaction pooler (port 6543) with pgbouncer=true for Vercel serverless.",
    };
  }

  return { normalizedUrl: parsed.toString() };
}