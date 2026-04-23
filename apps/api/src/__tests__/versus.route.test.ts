/**
 * Integration tests for POST /api/versus/vote
 *
 * Prisma and rate limiting are mocked. Auth uses the dev-bypass path.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
}));

const prismaMock = vi.hoisted(() => ({
  versusMatch: { findUnique: vi.fn(), update: vi.fn() },
  versusVote: { upsert: vi.fn(), count: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

import { versusRouter } from "../routes/versus";

// ── Test app ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.route("/api/versus", versusRouter);
  return app;
}

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "x-ems-user-id": "voter-user-id",
};

// ── Match fixture ─────────────────────────────────────────────────────────

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    songAId: "song-a",
    songBId: "song-b",
    status: "ACTIVE",
    endsAt: new Date(Date.now() + 3_600_000), // 1 hour from now
    votesA: 0,
    votesB: 0,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/versus/vote", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 when matchId is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ votedSongId: "song-a" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when votedSongId is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the match does not exist", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "ghost-match", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/match not found/i);
  });

  it("returns 409 when the match status is COMPLETED", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(
      makeMatch({ status: "COMPLETED" })
    );
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/match has ended/i);
  });

  it("auto-closes and returns 409 when endsAt is in the past", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(
      makeMatch({ endsAt: new Date(Date.now() - 1000) })
    );
    prismaMock.versusMatch.update.mockResolvedValue({});

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });

    expect(res.status).toBe(409);
    expect(prismaMock.versusMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "COMPLETED" },
      })
    );
  });

  it("returns 400 when votedSongId is not one of the two songs in the match", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(makeMatch());
    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-c" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/one of the two songs/i);
  });

  it("upserts the vote and returns updated vote counts for song A", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(makeMatch());
    prismaMock.versusVote.upsert.mockResolvedValue({});
    // First call: votesA count, second call: votesB count
    prismaMock.versusVote.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    prismaMock.versusMatch.update.mockResolvedValue({
      id: "match-1",
      votesA: 3,
      votesB: 1,
    });

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { matchId: string; votesA: number; votesB: number };
    expect(body.matchId).toBe("match-1");
    expect(body.votesA).toBe(3);
    expect(body.votesB).toBe(1);
  });

  it("upserts the vote and returns updated vote counts for song B", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(makeMatch());
    prismaMock.versusVote.upsert.mockResolvedValue({});
    prismaMock.versusVote.count.mockResolvedValueOnce(1).mockResolvedValueOnce(5);
    prismaMock.versusMatch.update.mockResolvedValue({
      id: "match-1",
      votesA: 1,
      votesB: 5,
    });

    const app = buildApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-b" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { votesA: number; votesB: number };
    expect(body.votesA).toBe(1);
    expect(body.votesB).toBe(5);
  });

  it("allows a user to change their vote (upsert behaviour)", async () => {
    prismaMock.versusMatch.findUnique.mockResolvedValue(makeMatch());
    prismaMock.versusVote.upsert.mockResolvedValue({});
    prismaMock.versusVote.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    prismaMock.versusMatch.update.mockResolvedValue({ id: "match-1", votesA: 0, votesB: 2 });

    const app = buildApp();
    // Vote for song-b (changing from a previous song-a vote handled by upsert)
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ matchId: "match-1", votedSongId: "song-b" }),
    });

    expect(prismaMock.versusVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId_userId: { matchId: "match-1", userId: "voter-user-id" } },
        update: { votedSongId: "song-b" },
      })
    );
    expect(res.status).toBe(200);
  });
});
