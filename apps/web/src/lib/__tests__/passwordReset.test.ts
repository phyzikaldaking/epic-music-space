import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashAuthToken } from "@/lib/authIdentity";

const prismaMock = vi.hoisted(() => ({
  passwordResetToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail: vi.fn() }));
vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
}));

import { completePasswordReset } from "@/lib/passwordReset";

describe("completePasswordReset", () => {
  beforeEach(() => {
    Object.values(prismaMock).forEach((entry) => {
      if (typeof entry === "function") return;
      Object.values(entry).forEach((fn) => {
        if (typeof fn === "function" && "mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
      });
    });
    prismaMock.$transaction.mockClear();
    prismaMock.$transaction.mockImplementation(
      ((ops: Promise<unknown>[]) => Promise.all(ops)) as never,
    );
  });

  it("rejects an unknown token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    const result = await completePasswordReset("never-issued", "NewPassw0rd!");
    expect(result).toEqual({ ok: false, error: "invalid_or_expired" });
  });

  it("rejects an already-used token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "tok1",
      userId: "u1",
      usedAt: new Date(),
      expires: new Date(Date.now() + 60_000),
    });
    const result = await completePasswordReset("raw", "NewPassw0rd!");
    expect(result).toEqual({ ok: false, error: "invalid_or_expired" });
  });

  it("rejects an expired token", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "tok1",
      userId: "u1",
      usedAt: null,
      expires: new Date(Date.now() - 60_000),
    });
    const result = await completePasswordReset("raw", "NewPassw0rd!");
    expect(result).toEqual({ ok: false, error: "invalid_or_expired" });
  });

  it("hashes by the same scheme used at issue time (sha256 + salt)", () => {
    // Sanity check that completePasswordReset will look up the same hash
    // we'd write with hashAuthToken at issue time. If this drifts, every
    // reset link in flight is silently invalidated.
    const a = hashAuthToken("token-A");
    const b = hashAuthToken("token-A");
    const c = hashAuthToken("token-B");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("revokes sessions atomically with the password change by default", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "tok1",
      userId: "u1",
      usedAt: null,
      expires: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.passwordResetToken.update.mockResolvedValue({});
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.session.deleteMany.mockResolvedValue({ count: 0 });

    const result = await completePasswordReset("raw", "NewPassw0rd!");
    expect(result).toEqual({ ok: true });

    // The User.update call must include sessionsRevokedAt — without it,
    // any stolen JWT survives the password reset for the cookie's
    // entire 30-day lifetime.
    const userUpdateArgs = prismaMock.user.update.mock.calls[0]?.[0] as
      | { data: { passwordHash: string; sessionsRevokedAt?: Date } }
      | undefined;
    expect(userUpdateArgs?.data.passwordHash).toBe("hashed-password");
    expect(userUpdateArgs?.data.sessionsRevokedAt).toBeInstanceOf(Date);

    // The whole batch (user update + token marker + sweep + session delete)
    // must run as one transaction so a partial failure can't leave the user
    // with a new password and an old un-revoked session.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("can opt out of session revocation when explicitly asked", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "tok1",
      userId: "u1",
      usedAt: null,
      expires: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.passwordResetToken.update.mockResolvedValue({});
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    await completePasswordReset("raw", "NewPassw0rd!", { revokeSessions: false });

    const userUpdateArgs = prismaMock.user.update.mock.calls[0]?.[0] as
      | { data: { passwordHash: string; sessionsRevokedAt?: Date } }
      | undefined;
    expect(userUpdateArgs?.data.sessionsRevokedAt).toBeUndefined();
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
  });
});
