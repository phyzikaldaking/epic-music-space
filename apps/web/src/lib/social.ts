import { prisma } from "./prisma";
import { encryptToken, decryptToken } from "./crypto";

export type Provider = "twitter" | "instagram";

export async function upsertConnectedAccount(options: {
  userId: string;
  provider: Provider;
  providerAccountId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  meta?: Record<string, unknown>;
}) {
  const data: any = {
    userId: options.userId,
    provider: options.provider,
    providerAccountId: options.providerAccountId,
    meta: options.meta ?? {},
  };

  if (options.accessToken) data.accessToken = encryptToken(options.accessToken);
  if (options.refreshToken) data.refreshToken = encryptToken(options.refreshToken);
  if (options.expiresAt) data.expiresAt = options.expiresAt;

  // Prisma client may not have generated types yet; access via any to avoid TS errors
  return (prisma as any).connectedAccount.upsert({
    where: { provider_providerAccountId: { provider: options.provider, providerAccountId: options.providerAccountId } },
    create: data,
    update: data,
  });
}

export async function listConnectedAccounts(userId: string) {
  const rows = await (prisma as any).connectedAccount.findMany({ where: { userId } });
  return rows.map((r: any) => ({
    id: r.id,
    provider: r.provider,
    providerAccountId: r.providerAccountId,
    meta: r.meta,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function getAccessTokenForAccount(id: string) {
  const row = await (prisma as any).connectedAccount.findUnique({ where: { id } });
  if (!row) return null;
  return row.accessToken ? decryptToken(row.accessToken) : null;
}
