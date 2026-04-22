import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

vi.mock("@ems/db", () => ({
  prisma: {
    versusMatch: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    versusVote: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("rate-limiter-flexible", () => ({
  RateLimiterMemory: vi.fn().mockImplementation(() => ({ consume: vi.fn() })),
  RateLimiterRedis: vi.fn().mockImplementation(() => ({ consume: vi.fn() })),
}));

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    status: "ready",
  })),
}));

// ─────────────────────────────────────────────────────────
// Test app factory
// ─────────────────────────────────────────────────────────

async function getApp(userId = "test-voter-1") {
  const { versusRouter } = await import("../../routes/versus");
  const app = new Hono();
  app.use("*", (c, next) => {
    c.set("userId", userId);
    return next();
  });
  app.route("/api/versus", versusRouter);
  return app;
}

async function postVote(body: unknown, userId?: string) {
  const app = await getApp(userId);
  return app.request("/api/versus/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId ?? "test-voter-1",
    },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// Active match fixture
// ─────────────────────────────────────────────────────────

const activeMatch = {
  id: "match-1",
  songAId: "song-a",
  songBId: "song-b",
  status: "ACTIVE",
  votesA: 0,
  votesB: 0,
  endsAt: new Date(Date.now() + 60_000), // 1 minute in the future
};

// ─────────────────────────────────────────────────────────
// POST /api/versus/vote
// ─────────────────────────────────────────────────────────

describe("POST /api/versus/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = await getApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "test-voter-1" },
      body: "{invalid json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 when matchId is missing", async () => {
    const res = await postVote({ votedSongId: "song-a" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when votedSongId is missing", async () => {
    const res = await postVote({ matchId: "match-1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when match does not exist", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(null);

    const res = await postVote({ matchId: "missing-match", votedSongId: "song-a" });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/match not found/i);
  });

  it("returns 409 when match is already COMPLETED", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue({
      ...activeMatch,
      status: "COMPLETED",
    } as never);

    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/ended/i);
  });

  it("returns 409 and auto-closes expired match", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue({
      ...activeMatch,
      status: "ACTIVE",
      endsAt: new Date(Date.now() - 60_000), // 1 minute in the past
    } as never);
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({} as never);

    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(409);
    expect(vi.mocked(prisma.versusMatch.update)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "COMPLETED" } })
    );
  });

  it("returns 400 when votedSongId is not one of the two match songs", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);

    const res = await postVote({ matchId: "match-1", votedSongId: "song-c" });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/votedSongId must be one of/i);
  });

  it("successfully casts a vote for song A and returns updated counts", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count)
      .mockResolvedValueOnce(3) // votesA
      .mockResolvedValueOnce(1); // votesB
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      ...activeMatch,
      votesA: 3,
      votesB: 1,
    } as never);

    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(200);
    const body = await res.json() as { matchId: string; votesA: number; votesB: number };
    expect(body.matchId).toBe("match-1");
    expect(body.votesA).toBe(3);
    expect(body.votesB).toBe(1);
  });

  it("successfully casts a vote for song B and returns updated counts", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count)
      .mockResolvedValueOnce(1) // votesA
      .mockResolvedValueOnce(5); // votesB
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      ...activeMatch,
      votesA: 1,
      votesB: 5,
    } as never);

    const res = await postVote({ matchId: "match-1", votedSongId: "song-b" });
    expect(res.status).toBe(200);
    const body = await res.json() as { votesA: number; votesB: number };
    expect(body.votesA).toBe(1);
    expect(body.votesB).toBe(5);
  });

  it("upserts the vote (update if user already voted)", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count).mockResolvedValue(2);
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      ...activeMatch,
      votesA: 2,
      votesB: 2,
    } as never);

    await postVote({ matchId: "match-1", votedSongId: "song-a" });

    expect(vi.mocked(prisma.versusVote.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId_userId: { matchId: "match-1", userId: "test-voter-1" } },
        create: expect.objectContaining({ votedSongId: "song-a" }),
        update: expect.objectContaining({ votedSongId: "song-a" }),
      })
    );
  });
});
