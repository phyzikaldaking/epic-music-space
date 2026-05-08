import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const limiterConsumeMock = vi.hoisted(() => vi.fn());
const bcryptHashMock = vi.hoisted(() => vi.fn());
const isLikelyBotMock = vi.hoisted(() => vi.fn(() => false));
const emitAuthEventMock = vi.hoisted(() => vi.fn());
const riskEventMock = vi.hoisted(() => vi.fn());
const sendVerificationEmailMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => ({
  storage: {
    from: vi.fn(),
  },
}));
const stripeConstructEventMock = vi.hoisted(() => vi.fn());
const stripeTransferCreateMock = vi.hoisted(() => vi.fn());
const recordLicenseSaleMock = vi.hoisted(() => vi.fn());

const txMock = vi.hoisted(() => ({
  user: { create: vi.fn() },
  connectedAccount: { create: vi.fn() },
  song: { updateMany: vi.fn(), findUnique: vi.fn() },
  licenseToken: { create: vi.fn() },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  user: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  connectedAccount: { findUnique: vi.fn() },
  inviteCode: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  studio: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  verificationToken: { create: vi.fn() },
  processedWebhook: { create: vi.fn() },
  transaction: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
   payout: {
     findFirst: vi.fn(),
     create: vi.fn(),
     updateMany: vi.fn(),
   },
}));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rateLimit", () => ({
  strictLimiter: { consume: limiterConsumeMock },
  moderateLimiter: { consume: limiterConsumeMock },
}));
vi.mock("bcryptjs", () => ({ default: { hash: bcryptHashMock } }));
vi.mock("@/lib/authObservability", () => ({ emitAuthEvent: emitAuthEventMock }));
vi.mock("@/lib/riskEvents", () => ({ recordRiskEvent: riskEventMock }));
vi.mock("@/lib/botCheck", () => ({ isLikelyBot: isLikelyBotMock }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: vi.fn(() => ({ ok: true })) }));
vi.mock("@/lib/email", () => ({
  sendVerificationEmail: sendVerificationEmailMock,
  sendArtistMilestoneEmail: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));
vi.mock("@/lib/badges", () => ({
  maybeAwardEarlyAdopter: vi.fn(),
  checkInviteMilestones: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/supabase", () => ({
  CHANNELS: { leaderboard: "leaderboard" },
  createServerSupabaseClient: () => supabaseMock,
}));
vi.mock("@/lib/site", () => ({ getSiteUrl: () => "https://epicmusicspace.com" }));
vi.mock("@/lib/stripe", () => ({
  getStripeWebhookSecret: () => "whsec_test",
  stripe: {
    webhooks: { constructEvent: stripeConstructEventMock },
    transfers: { create: stripeTransferCreateMock },
    refunds: { create: vi.fn() },
  },
}));
vi.mock("@/lib/revenueShare", () => ({
  recordLicenseSale: recordLicenseSaleMock,
  recordTip: vi.fn(),
  recordAdPurchase: vi.fn(),
  recordRefund: vi.fn(),
  recordAuctionWin: vi.fn(),
  recordBoost: vi.fn(),
  recordSubscription: vi.fn(),
  recordServiceSale: vi.fn(),
}));
vi.mock("@/lib/queues", () => ({
  enqueueNotification: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as upload } from "@/app/api/upload/route";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";

describe("critical commerce and account E2E surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://test";
    limiterConsumeMock.mockResolvedValue(undefined);
    isLikelyBotMock.mockReturnValue(false);
    bcryptHashMock.mockResolvedValue("hashed-password");
    emitAuthEventMock.mockResolvedValue(undefined);
    riskEventMock.mockResolvedValue(undefined);
    sendVerificationEmailMock.mockResolvedValue({ ok: true });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) => cb(txMock));
  });

  it("signs up an artist, creates verification, and returns studio onboarding data", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.connectedAccount.findUnique.mockResolvedValue(null);
    txMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "artist@example.com",
      name: "Artist One",
      role: "ARTIST",
    });
    prismaMock.inviteCode.create.mockResolvedValue({ id: "invite-1" });
    prismaMock.studio.findFirst.mockResolvedValue(null);
    prismaMock.studio.create.mockResolvedValue({ id: "studio-1" });
    prismaMock.verificationToken.create.mockResolvedValue({ identifier: "artist@example.com" });

    const res = await register(
      new NextRequest("https://epicmusicspace.com/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" },
        body: JSON.stringify({
          name: "Artist One",
          email: "ARTIST@example.com",
          password: "StrongPass123",
          confirmPassword: "StrongPass123",
          role: "ARTIST",
          ageConfirmed: true,
          termsAccepted: true,
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.requiresVerification).toBe(true);
    expect(body.studioUsername).toBe("artist-one");
    expect(isLikelyBotMock).toHaveBeenCalledWith({
      headers: expect.any(Headers),
    });
    expect(txMock.user.create).toHaveBeenCalled();
    expect(prismaMock.verificationToken.create).toHaveBeenCalled();
  });

  it("issues a direct-to-storage upload URL for authenticated audio uploads", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const bucket = {
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://supabase.test/upload" },
        error: null,
      }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://supabase.test/audio/user-1/file.mp3" },
      }),
    };
    supabaseMock.storage.from.mockReturnValue(bucket);

    const res = await upload(
      new NextRequest("https://epicmusicspace.com/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "audio",
          fileName: "single.mp3",
          mimeType: "audio/mpeg",
          fileSize: 3_000_000,
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.signedUrl).toBe("https://supabase.test/upload");
    expect(bucket.createSignedUploadUrl).toHaveBeenCalled();
  });

  it("fulfills license delivery and payout from a Stripe checkout webhook", async () => {
    stripeConstructEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_license_1",
          mode: "payment",
          payment_intent: "pi_1",
          metadata: { type: "license_purchase", songId: "song-1", userId: "buyer-1" },
        },
      },
    });
    prismaMock.processedWebhook.create.mockResolvedValue({ id: "dedupe-1" });
    prismaMock.transaction.findUnique.mockResolvedValue({
      id: "tx-1",
      userId: "buyer-1",
      amount: 20,
      status: "PENDING",
      song: {
        id: "song-1",
        title: "Track One",
        artist: "Artist One",
        artistId: "artist-1",
        soldLicenses: 0,
        totalLicenses: 10,
        revenueSharePct: 70,
      },
    });
    txMock.song.updateMany.mockResolvedValue({ count: 1 });
    txMock.song.findUnique.mockResolvedValue({ soldLicenses: 1 });
    txMock.licenseToken.create.mockResolvedValue({ id: "license-1", tokenNumber: 1 });
    prismaMock.transaction.update.mockResolvedValue({ id: "tx-1" });
    prismaMock.payout.create.mockResolvedValue({ id: "payout-1" });
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ email: "artist@example.com", name: "Artist One" })
      .mockResolvedValueOnce({ stripeConnectId: "acct_1" });
    stripeTransferCreateMock.mockResolvedValue({ id: "tr_1" });
    prismaMock.payout.updateMany.mockResolvedValue({ count: 1 });
    recordLicenseSaleMock.mockResolvedValue(undefined);

    const res = await stripeWebhook(
      new NextRequest("https://epicmusicspace.com/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: "{}",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.received).toBe(true);
    expect(txMock.licenseToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ songId: "song-1", holderId: "buyer-1" }),
      }),
    );
    expect(prismaMock.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED", licenseTokenId: "license-1" }),
      }),
    );
    expect(prismaMock.payout.create).toHaveBeenCalled();
  });
});
