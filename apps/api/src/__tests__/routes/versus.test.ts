import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock @ems/db ───────────────────────────────────────────────────────────────
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

// ── Mock rate limiting ─────────────────────────────────────────────────────────
vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

import { prisma } from "@ems/db";
import { versusRouter } from "../../routes/versus";

function buildApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const id = c.req.header("x-ems-user-id");
    if (!id) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", id);
    await next();
  });
  app.route("/api/versus", versusRouter);
  return app;
}

// An active match in the future
const futureDate = new Date(Date.now() + 60 * 60 * 1000);
const activeMatch = {
  id: "match-1",
  songAId: "song-a",
  songBId: "song-b",
  status: "ACTIVE",
  endsAt: futureDate,
  votesA: 0,
  votesB: 0,
};

describe("POST /api/versus/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: "bad-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Invalid JSON body" });
  });

  it("returns 400 when matchId is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ votedSongId: "song-a" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when votedSongId is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when match does not exist", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "nonexistent", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Match not found" });
  });

  it("returns 409 when match status is COMPLETED", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue({
      ...activeMatch,
      status: "COMPLETED",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "This match has ended" });
  });

  it("returns 409 and auto-closes match when endsAt is in the past", async () => {
    const pastDate = new Date(Date.now() - 1000);
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue({
      ...activeMatch,
      endsAt: pastDate,
      status: "ACTIVE",
    } as never);
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({} as never);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: "This match has ended" });

    // Verify the match was auto-closed
    expect(prisma.versusMatch.update).toHaveBeenCalledWith({
      where: { id: "match-1" },
      data: { status: "COMPLETED" },
    });
  });

  it("returns 400 when votedSongId is not one of the two match songs", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-c" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "votedSongId must be one of the two songs in this match",
    });
  });

  it("successfully casts a vote for songA and returns updated counts", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count)
      .mockResolvedValueOnce(3)  // votesA
      .mockResolvedValueOnce(1); // votesB
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      id: "match-1",
      votesA: 3,
      votesB: 1,
    } as never);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matchId: "match-1", votesA: 3, votesB: 1 });
  });

  it("successfully casts a vote for songB and returns updated counts", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count)
      .mockResolvedValueOnce(1)  // votesA
      .mockResolvedValueOnce(5); // votesB
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      id: "match-1",
      votesA: 1,
      votesB: 5,
    } as never);

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-b" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ matchId: "match-1", votesA: 1, votesB: 5 });
  });

  it("upserts vote with correct data", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count).mockResolvedValue(0);
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      id: "match-1",
      votesA: 0,
      votesB: 0,
    } as never);

    const app = buildApp();
    await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "voter-123" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-b" }),
    });

    expect(prisma.versusVote.upsert).toHaveBeenCalledWith({
      where: { matchId_userId: { matchId: "match-1", userId: "voter-123" } },
      create: { matchId: "match-1", userId: "voter-123", votedSongId: "song-b" },
      update: { votedSongId: "song-b" },
    });
  });

  it("recounts both songs after vote is upserted", async () => {
    vi.mocked(prisma.versusMatch.findUnique).mockResolvedValue(activeMatch as never);
    vi.mocked(prisma.versusVote.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.versusVote.count).mockResolvedValue(2);
    vi.mocked(prisma.versusMatch.update).mockResolvedValue({
      id: "match-1",
      votesA: 2,
      votesB: 2,
    } as never);

    const app = buildApp();
    await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "user-1" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });

    // Both counts should be fetched
    expect(prisma.versusVote.count).toHaveBeenCalledTimes(2);
    expect(prisma.versusVote.count).toHaveBeenCalledWith({
      where: { matchId: "match-1", votedSongId: "song-a" },
    });
    expect(prisma.versusVote.count).toHaveBeenCalledWith({
      where: { matchId: "match-1", votedSongId: "song-b" },
    });
  });
});
