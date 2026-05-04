import { PrismaClient } from "@ems/db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Serverless-on-Vercel best practice: the pooler URL should include
// pgbouncer=true and connection_limit=1 so each Function instance only opens
// a single Postgres connection. If those flags are missing we log once at
// boot — it can quietly cause connection-pool exhaustion under load.
if (process.env.NODE_ENV === "production" && process.env.VERCEL && !globalForPrisma.prisma) {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("pgbouncer=true")) {
    console.warn(
      "[prisma] DATABASE_URL is missing `pgbouncer=true` — under load you will hit Supabase's connection cap. Append `?pgbouncer=true&connection_limit=1` to the URL.",
    );
  } else if (!url.includes("connection_limit=")) {
    console.warn(
      "[prisma] DATABASE_URL has pgbouncer but no connection_limit — recommend appending `&connection_limit=1` for Vercel Functions.",
    );
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
