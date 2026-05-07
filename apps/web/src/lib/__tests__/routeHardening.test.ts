import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.hoisted(() => vi.fn());
const strictConsumeMock = vi.hoisted(() => vi.fn());
const moderateConsumeMock = vi.hoisted(() => vi.fn());
const chatWithAssistantMock = vi.hoisted(() => vi.fn());
const readJsonBodyLimitedMock = vi.hoisted(() => vi.fn());
const withRouteTimeoutMock = vi.hoisted(() => vi.fn());
const createServerSupabaseClientMock = vi.hoisted(() => vi.fn());
const stripeConstructEventMock = vi.hoisted(() => vi.fn());
const prismaProcessedWebhookCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/rateLimit", () => ({
  strictLimiter: { consume: strictConsumeMock },
  moderateLimiter: { consume: moderateConsumeMock },
}));
vi.mock("@/lib/ai", () => ({ chatWithAssistant: chatWithAssistantMock }));
vi.mock("@/lib/apiHardening", () => ({
  readJsonBodyLimited: readJsonBodyLimitedMock,
  withRouteTimeout: withRouteTimeoutMock,
}));
vi.mock("@/lib/supabase", () => ({
  CHANNELS: { leaderboard: "leaderboard" },
  createServerSupabaseClient: createServerSupabaseClientMock,
}));
vi.mock("@/lib/stripe", () => ({
  getStripeWebhookSecret: () => "whsec_test",
  stripe: {
    webhooks: { constructEvent: stripeConstructEventMock },
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    processedWebhook: { create: prismaProcessedWebhookCreateMock },
  },
}));
vi.mock("@/lib/queues", () => ({
  enqueueNotification: vi.fn(),
  enqueuePayoutTransfer: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/cacheTags", () => ({ CACHE_TAGS: {} }));
vi.mock("@/lib/revenueShare", () => ({
  recordLicenseSale: vi.fn(),
  recordTip: vi.fn(),
  recordAdPurchase: vi.fn(),
  recordRefund: vi.fn(),
  recordAuctionWin: vi.fn(),
  recordBoost: vi.fn(),
  recordSubscription: vi.fn(),
  recordServiceSale: vi.fn(),
}));
vi.mock("@/lib/email", () => ({
  sendArtistMilestoneEmail: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));
vi.mock("@/lib/riskEvents", () => ({ recordRiskEvent: vi.fn() }));
vi.mock("@/lib/pager", () => ({ page: vi.fn(() => ({ items: [], nextCursor: null })) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST as aiChatPost } from "@/app/api/ai/chat/route";
import { POST as uploadPost } from "@/app/api/upload/route";
import { POST as stripeWebhookPost } from "@/app/api/webhooks/stripe/route";

describe("route hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    strictConsumeMock.mockResolvedValue(undefined);
    moderateConsumeMock.mockResolvedValue(undefined);
    chatWithAssistantMock.mockResolvedValue("ok");
    readJsonBodyLimitedMock.mockResolvedValue({ ok: true, value: { messages: [{ role: "user", content: "hi" }] } });
    withRouteTimeoutMock.mockImplementation(async (_label: string, _timeoutMs: number, operation: () => Promise<unknown>) => ({
      ok: true,
      value: await operation(),
    }));
    createServerSupabaseClientMock.mockReturnValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://supabase.test/upload" },
            error: null,
          }),
          getPublicUrl: vi.fn(() => ({
            data: { publicUrl: "https://supabase.test/public.mp3" },
          })),
        })),
      },
    });
    stripeConstructEventMock.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          mode: "payment",
          metadata: { type: "license_purchase", songId: "song-1", userId: "buyer-1" },
        },
      },
    });
    prismaProcessedWebhookCreateMock.mockResolvedValue({ id: "seen-1" });
  });

  it("returns request id header on ai chat timeout responses", async () => {
    withRouteTimeoutMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Service temporarily overloaded. Please retry." }, { status: 503 }),
    });

    const res = await aiChatPost(
      new NextRequest("https://epicmusicspace.com/api/ai/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-ai-1",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
      }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("x-request-id")).toBe("req-ai-1");
  });

  it("returns request id header on upload signed-url timeout responses", async () => {
    readJsonBodyLimitedMock.mockResolvedValueOnce({
      ok: true,
      value: {
        type: "audio",
        fileName: "track.mp3",
        mimeType: "audio/mpeg",
        fileSize: 1024,
      },
    });
    withRouteTimeoutMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Service temporarily overloaded. Please retry." }, { status: 503 }),
    });

    const res = await uploadPost(
      new NextRequest("https://epicmusicspace.com/api/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-upload-1",
        },
        body: JSON.stringify({
          type: "audio",
          fileName: "track.mp3",
          mimeType: "audio/mpeg",
          fileSize: 1024,
        }),
      }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("x-request-id")).toBe("req-upload-1");
  });

  it("returns request id header on stripe webhook processing timeout responses", async () => {
    withRouteTimeoutMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Service temporarily overloaded. Please retry." }, { status: 503 }),
    });

    const res = await stripeWebhookPost(
      new NextRequest("https://epicmusicspace.com/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "sig_test",
          "x-request-id": "req-webhook-1",
        },
        body: "{}",
      }),
    );

    expect(res.status).toBe(503);
    expect(res.headers.get("x-request-id")).toBe("req-webhook-1");
    expect(prismaProcessedWebhookCreateMock).toHaveBeenCalled();
  });
});
