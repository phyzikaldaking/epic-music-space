import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const consumeMock = vi.hoisted(() => vi.fn());
const trackMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rateLimit", () => ({
  strictLimiter: { consume: consumeMock },
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

import { POST } from "@/app/api/analytics/funnel/route";

describe("POST /api/analytics/funnel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMock.mockResolvedValue(undefined);
  });

  it("accepts artist funnel events and forwards structured properties", async () => {
    const res = await POST(
      new NextRequest("https://epicmusicspace.com/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" },
        body: JSON.stringify({
          event: "funnel_artist_upload_submit_attempt",
          role: "ARTIST",
          source: "studio_new",
          properties: { hasStems: true },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(trackMock).toHaveBeenCalledWith({
      event: "funnel_artist_upload_submit_attempt",
      properties: {
        role: "ARTIST",
        ip: "203.0.113.9",
        source: "studio_new",
        hasStems: true,
      },
    });
  });

  it("rejects unknown events", async () => {
    const res = await POST(
      new NextRequest("https://epicmusicspace.com/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "not_a_real_funnel_event" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    consumeMock.mockRejectedValueOnce(new Error("rate limited"));
    const res = await POST(
      new NextRequest("https://epicmusicspace.com/api/analytics/funnel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "funnel_artist_upload_view" }),
      }),
    );

    expect(res.status).toBe(429);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
