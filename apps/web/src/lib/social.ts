import { prisma } from "./prisma";
import { Prisma } from "@ems/db";
import { encryptToken, decryptToken } from "./crypto";

export type Provider = "twitter" | "instagram";

interface ConnectedAccountUpsert {
  userId: string;
  provider: Provider;
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  meta?: Record<string, unknown>;
}

export async function upsertConnectedAccount(options: ConnectedAccountUpsert) {
  const data: Prisma.ConnectedAccountUncheckedCreateInput = {
    userId: options.userId,
    provider: options.provider,
    providerAccountId: options.providerAccountId,
    meta: (options.meta ?? {}) as Prisma.InputJsonValue,
    accessToken: options.accessToken ? encryptToken(options.accessToken) : null,
    refreshToken: options.refreshToken ? encryptToken(options.refreshToken) : null,
    expiresAt: options.expiresAt ?? null,
  };

  return prisma.connectedAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: options.provider,
        providerAccountId: options.providerAccountId,
      },
    },
    create: data,
    update: data,
  });
}

export async function listConnectedAccounts(userId: string) {
  const rows = await prisma.connectedAccount.findMany({ where: { userId } });
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    providerAccountId: r.providerAccountId,
    meta: r.meta,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getAccessTokenForAccount(id: string) {
  const row = await prisma.connectedAccount.findUnique({ where: { id } });
  if (!row) return null;
  return row.accessToken ? decryptToken(row.accessToken) : null;
}
