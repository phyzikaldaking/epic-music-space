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

vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

// ─────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────

import { prisma } from "@ems/db";
import { versusRouter } from "../../routes/versus";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

const mockMatchFind   = prisma.versusMatch.findUnique as ReturnType<typeof vi.fn>;
const mockMatchUpdate = prisma.versusMatch.update     as ReturnType<typeof vi.fn>;
const mockVoteUpsert  = prisma.versusVote.upsert      as ReturnType<typeof vi.fn>;
const mockVoteCount   = prisma.versusVote.count       as ReturnType<typeof vi.fn>;

function makeApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const userId = c.req.header("x-ems-user-id");
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", userId);
    return next();
  });
  app.route("/", versusRouter);
  return app;
}

function makeMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: "match-1",
    songAId: "song-a",
    songBId: "song-b",
    status: "ACTIVE",
    votesA: 0,
    votesB: 0,
    endsAt: new Date(Date.now() + 60_000), // ends 1 minute from now
    ...overrides,
  };
}

function voteRequest(body: unknown, userId = "voter-1") {
  return new Request("http://localhost/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId,
    },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// POST /vote
// ─────────────────────────────────────────────────────────

describe("POST /vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no user id is provided", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: "match-1", votedSongId: "song-a" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ems-user-id": "voter-1",
        },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when matchId is missing", async () => {
    const app = makeApp();
    const res = await app.request(voteRequest({ votedSongId: "song-a" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when votedSongId is missing", async () => {
    const app = makeApp();
    const res = await app.request(voteRequest({ matchId: "match-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when match does not exist", async () => {
    mockMatchFind.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "ghost-match", votedSongId: "song-a" })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Match not found");
  });

  it("returns 409 when match status is COMPLETED", async () => {
    mockMatchFind.mockResolvedValue(makeMatch({ status: "COMPLETED" }));
    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-a" })
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/ended/i);
  });

  it("returns 409 and auto-closes the match when endsAt is in the past", async () => {
    mockMatchFind.mockResolvedValue(
      makeMatch({ status: "ACTIVE", endsAt: new Date(Date.now() - 1000) })
    );
    mockMatchUpdate.mockResolvedValue({});

    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-a" })
    );
    expect(res.status).toBe(409);
    // The auto-close update must have been called
    expect(mockMatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "match-1" },
        data: { status: "COMPLETED" },
      })
    );
  });

  it("returns 400 when votedSongId is not one of the two match songs", async () => {
    mockMatchFind.mockResolvedValue(makeMatch());
    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-unrelated" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/two songs/i);
  });

  it("upserts the vote for song A and returns updated counts", async () => {
    mockMatchFind.mockResolvedValue(makeMatch());
    mockVoteUpsert.mockResolvedValue({});
    // count returns 3 for song A, 1 for song B
    mockVoteCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    mockMatchUpdate.mockResolvedValue({ votesA: 3, votesB: 1 });

    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-a" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matchId).toBe("match-1");
    expect(json.votesA).toBe(3);
    expect(json.votesB).toBe(1);
  });

  it("upserts the vote for song B and returns updated counts", async () => {
    mockMatchFind.mockResolvedValue(makeMatch({ votesA: 1, votesB: 0 }));
    mockVoteUpsert.mockResolvedValue({});
    mockVoteCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    mockMatchUpdate.mockResolvedValue({ votesA: 1, votesB: 2 });

    const app = makeApp();
    const res = await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-b" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.votesB).toBe(2);
  });

  it("calls versusVote.upsert with correct arguments", async () => {
    mockMatchFind.mockResolvedValue(makeMatch());
    mockVoteUpsert.mockResolvedValue({});
    mockVoteCount.mockResolvedValue(0);
    mockMatchUpdate.mockResolvedValue({ votesA: 0, votesB: 0 });

    const app = makeApp();
    await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-a" }, "voter-abc")
    );

    expect(mockVoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId_userId: { matchId: "match-1", userId: "voter-abc" } },
        create: { matchId: "match-1", userId: "voter-abc", votedSongId: "song-a" },
        update: { votedSongId: "song-a" },
      })
    );
  });

  it("updates the match vote counts after the vote", async () => {
    mockMatchFind.mockResolvedValue(makeMatch());
    mockVoteUpsert.mockResolvedValue({});
    mockVoteCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    mockMatchUpdate.mockResolvedValue({ votesA: 5, votesB: 3 });

    const app = makeApp();
    await app.request(
      voteRequest({ matchId: "match-1", votedSongId: "song-a" })
    );

    expect(mockMatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "match-1" },
        data: { votesA: 5, votesB: 3 },
      })
    );
  });
});
