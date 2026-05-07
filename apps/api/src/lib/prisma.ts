import { PrismaClient } from "@ems/db";
import { resolvePrismaDatasourceUrl } from "./prismaDatasourceUrl";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const datasourceResolution = resolvePrismaDatasourceUrl(process.env.DATABASE_URL ?? "", {
  nodeEnv: process.env.NODE_ENV,
  vercel: process.env.VERCEL,
  minConnectionLimit: process.env.PRISMA_MIN_CONNECTION_LIMIT,
});
if (datasourceResolution.warning) {
  console.warn(datasourceResolution.warning);
}
const datasourceUrl = datasourceResolution.normalizedUrl;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
