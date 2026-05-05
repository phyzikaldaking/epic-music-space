import { prisma } from "./prisma";
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

interface ConnectedAccountRow {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  meta: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface ConnectedAccountData {
  userId: string;
  provider: Provider;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  meta: Record<string, unknown>;
}

// The Prisma model exists in schema.prisma but the generated client in this
// monorepo isn't always re-run before code lands, so we narrow the prisma
// client surface to just what we need via a typed cast — no `any` required.
interface ConnectedAccountDelegate {
  upsert(args: {
    where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
    create: ConnectedAccountData;
    update: ConnectedAccountData;
  }): Promise<ConnectedAccountRow>;
  findMany(args: { where: { userId: string } }): Promise<ConnectedAccountRow[]>;
  findUnique(args: { where: { id: string } }): Promise<ConnectedAccountRow | null>;
}

const connectedAccount = (
  prisma as unknown as { connectedAccount: ConnectedAccountDelegate }
).connectedAccount;

export async function upsertConnectedAccount(options: ConnectedAccountUpsert) {
  const data: ConnectedAccountData = {
    userId: options.userId,
    provider: options.provider,
    providerAccountId: options.providerAccountId,
    meta: options.meta ?? {},
    accessToken: options.accessToken ? encryptToken(options.accessToken) : null,
    refreshToken: options.refreshToken ? encryptToken(options.refreshToken) : null,
    expiresAt: options.expiresAt ?? null,
  };

  return connectedAccount.upsert({
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
  const rows = await connectedAccount.findMany({ where: { userId } });
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
  const row = await connectedAccount.findUnique({ where: { id } });
  if (!row) return null;
  return row.accessToken ? decryptToken(row.accessToken) : null;
}
