import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────────────────

const mockPrisma = {
  versusMatch: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  versusVote: {
    upsert: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("@ems/db", () => ({ prisma: mockPrisma }));

vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
}));

vi.mock("../middleware/auth", () => ({
  authMiddleware: async (
    c: { req: { header: (h: string) => string | undefined }; set: (k: string, v: string) => void },
    next: () => Promise<void>
  ) => {
    const userId = c.req.header("x-ems-user-id");
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    c.set("userId", userId);
    return next();
  },
}));

// ─────────────────────────────────────────────────────────
// Import the router under test (after mocks are registered)
// ─────────────────────────────────────────────────────────

const { versusRouter } = await import("../routes/versus");

function makeApp() {
  const app = new Hono();
  app.route("/api/versus", versusRouter);
  return app;
}

function postVote(body: unknown, userId = "voter-1") {
  return makeApp().request("/api/versus/vote", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId,
    },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────

function makeActiveMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "match-1",
    songAId: "song-a",
    songBId: "song-b",
    status: "ACTIVE",
    votesA: 0,
    votesB: 0,
    endsAt: new Date(Date.now() + 3_600_000), // 1 hour from now
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("POST /api/versus/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no auth header is provided", async () => {
    const app = makeApp();
    const res = await app.request("/api/versus/vote", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const app = makeApp();
    const res = await app.request("/api/versus/vote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "voter-1",
      },
      body: "not-valid-json{",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when matchId is missing", async () => {
    const res = await postVote({ votedSongId: "song-a" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when votedSongId is missing", async () => {
    const res = await postVote({ matchId: "match-1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the match does not exist", async () => {
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(null);
    const res = await postVote({ matchId: "nonexistent", votedSongId: "song-a" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Match not found");
  });

  it("returns 409 when the match is already COMPLETED", async () => {
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(
      makeActiveMatch({ status: "COMPLETED" })
    );
    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This match has ended");
  });

  it("returns 409 and auto-closes an expired ACTIVE match", async () => {
    const expiredMatch = makeActiveMatch({
      status: "ACTIVE",
      endsAt: new Date(Date.now() - 1000), // 1 second in the past
    });
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(expiredMatch);
    mockPrisma.versusMatch.update.mockResolvedValueOnce({
      ...expiredMatch,
      status: "COMPLETED",
    });

    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("This match has ended");

    // Verify the match was closed
    expect(mockPrisma.versusMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "match-1" },
        data: { status: "COMPLETED" },
      })
    );
  });

  it("returns 400 when votedSongId is not one of the two songs in the match", async () => {
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(makeActiveMatch());
    const res = await postVote({
      matchId: "match-1",
      votedSongId: "song-c", // neither song-a nor song-b
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(
      "votedSongId must be one of the two songs in this match"
    );
  });

  it("returns 200 with updated vote counts when voting for song A", async () => {
    const activeMatch = makeActiveMatch();
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(activeMatch);
    mockPrisma.versusVote.upsert.mockResolvedValueOnce({});
    // Count votes: 1 for A, 0 for B
    mockPrisma.versusVote.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    mockPrisma.versusMatch.update.mockResolvedValueOnce({
      ...activeMatch,
      votesA: 1,
      votesB: 0,
    });

    const res = await postVote({ matchId: "match-1", votedSongId: "song-a" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matchId: string; votesA: number; votesB: number };
    expect(body.matchId).toBe("match-1");
    expect(body.votesA).toBe(1);
    expect(body.votesB).toBe(0);
  });

  it("returns 200 with updated vote counts when voting for song B", async () => {
    const activeMatch = makeActiveMatch({ votesA: 2, votesB: 1 });
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(activeMatch);
    mockPrisma.versusVote.upsert.mockResolvedValueOnce({});
    mockPrisma.versusVote.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    mockPrisma.versusMatch.update.mockResolvedValueOnce({
      ...activeMatch,
      votesA: 2,
      votesB: 2,
    });

    const res = await postVote({ matchId: "match-1", votedSongId: "song-b" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { votesA: number; votesB: number };
    expect(body.votesA).toBe(2);
    expect(body.votesB).toBe(2);
  });

  it("upserts the vote (allowing a user to change their vote)", async () => {
    const activeMatch = makeActiveMatch();
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(activeMatch);
    mockPrisma.versusVote.upsert.mockResolvedValueOnce({});
    mockPrisma.versusVote.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    mockPrisma.versusMatch.update.mockResolvedValueOnce({
      ...activeMatch,
      votesA: 0,
      votesB: 1,
    });

    await postVote({ matchId: "match-1", votedSongId: "song-b" });

    expect(mockPrisma.versusVote.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { matchId_userId: { matchId: "match-1", userId: "voter-1" } },
        create: expect.objectContaining({ votedSongId: "song-b" }),
        update: expect.objectContaining({ votedSongId: "song-b" }),
      })
    );
  });

  it("recounts votes from both songs after each upsert", async () => {
    const activeMatch = makeActiveMatch();
    mockPrisma.versusMatch.findUnique.mockResolvedValueOnce(activeMatch);
    mockPrisma.versusVote.upsert.mockResolvedValueOnce({});
    mockPrisma.versusVote.count.mockResolvedValueOnce(3).mockResolvedValueOnce(7);
    mockPrisma.versusMatch.update.mockResolvedValueOnce({
      ...activeMatch,
      votesA: 3,
      votesB: 7,
    });

    await postVote({ matchId: "match-1", votedSongId: "song-a" });

    expect(mockPrisma.versusVote.count).toHaveBeenCalledTimes(2);
    expect(mockPrisma.versusVote.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { matchId: "match-1", votedSongId: "song-a" } })
    );
    expect(mockPrisma.versusVote.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { matchId: "match-1", votedSongId: "song-b" } })
    );
  });
});
