import { PrismaClient } from "@ems/db";
import { resolvePrismaDatasourceUrl } from "./prismaDatasourceUrl";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const datasourceResolution = resolvePrismaDatasourceUrl(process.env.DATABASE_URL ?? "", {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    minConnectionLimit: process.env.PRISMA_MIN_CONNECTION_LIMIT,
  });
  if (datasourceResolution.warning) {
    console.warn(datasourceResolution.warning);
  }
  const datasourceUrl = datasourceResolution.normalizedUrl;

  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: keyof PrismaClient) {
    const value = getPrisma()[prop];
    return typeof value === "function" ? value.bind(getPrisma()) : value;
  },
  set(_target, prop: keyof PrismaClient, value) {
    return Reflect.set(getPrisma(), prop, value);
  },
  has(_target, prop: keyof PrismaClient) {
    return prop in getPrisma();
  },
});
