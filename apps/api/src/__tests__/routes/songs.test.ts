import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Mock @ems/db before importing anything that uses it
// ─────────────────────────────────────────────────────────

vi.mock("@ems/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    licenseToken: {
      findFirst: vi.fn(),
    },
    song: {
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  },
}));

// ─────────────────────────────────────────────────────────
// Mock stripe module
// ─────────────────────────────────────────────────────────

vi.mock("stripe", () => {
  const Stripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  }));
  return { default: Stripe };
});

// ─────────────────────────────────────────────────────────
// Mock rate-limit middleware (tested separately)
// ─────────────────────────────────────────────────────────

vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

import { prisma } from "@ems/db";
import { songsRouter } from "../../routes/songs";

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeApp() {
  const app = new Hono();
  // Dev auth bypass: if NEXT_PUBLIC_SUPABASE_URL is unset, x-ems-user-id is trusted
  app.use("*", async (c, next) => {
    const userId = c.req.header("x-ems-user-id");
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", userId);
    return next();
  });
  app.route("/", songsRouter);
  return app;
}

const mockUser = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const mockSongCreate = prisma.song.create as ReturnType<typeof vi.fn>;

const validBody = {
  title: "Test Track",
  artist: "DJ Test",
  genre: "Electronic",
  audioUrl: "https://cdn.example.com/audio.mp3",
  coverUrl: "https://cdn.example.com/cover.jpg",
  licensePrice: 29.99,
  revenueSharePct: 5,
  totalLicenses: 50,
};

function makeRequest(body: unknown, userId = "user-123") {
  return new Request("http://localhost/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId,
    },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// POST /upload
// ─────────────────────────────────────────────────────────

describe("POST /upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure development auth bypass is active
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 401 when no user id header is provided", async () => {
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when user does not exist in the database", async () => {
    mockUser.mockResolvedValue(null);
    const app = makeApp();
    const res = await app.request(makeRequest(validBody));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("User not found");
  });

  it("returns 403 when user has LISTENER role", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "LISTENER" });
    const app = makeApp();
    const res = await app.request(makeRequest(validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Only artists can upload songs");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const app = makeApp();
    const res = await app.request(
      new Request("http://localhost/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ems-user-id": "user-123",
        },
        body: "not-json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const app = makeApp();
    const res = await app.request(makeRequest({ title: "Missing Fields" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const app = makeApp();
    const res = await app.request(makeRequest({ ...validBody, title: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when audioUrl is not a valid URL", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const app = makeApp();
    const res = await app.request(makeRequest({ ...validBody, audioUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("returns 415 when an unsupported MIME type is provided", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const app = makeApp();
    const res = await app.request(
      makeRequest({ ...validBody, audioMimeType: "video/mp4" })
    );
    expect(res.status).toBe(415);
    const json = await res.json();
    expect(json.error).toMatch(/audio files/i);
  });

  it("accepts valid audio MIME types", async () => {
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    const createdSong = { id: "song-1", ...validBody, artistId: "user-123" };
    mockSongCreate.mockResolvedValue(createdSong);
    const app = makeApp();

    for (const mimeType of ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac"]) {
      vi.clearAllMocks();
      mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
      mockSongCreate.mockResolvedValue(createdSong);
      const res = await app.request(
        makeRequest({ ...validBody, audioMimeType: mimeType })
      );
      expect(res.status).toBe(201);
    }
  });

  it("creates song and returns 201 for a valid ARTIST request", async () => {
    const createdSong = {
      id: "song-abc",
      ...validBody,
      artistId: "user-123",
      createdAt: new Date().toISOString(),
    };
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    mockSongCreate.mockResolvedValue(createdSong);

    const app = makeApp();
    const res = await app.request(makeRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("song-abc");
    expect(mockSongCreate).toHaveBeenCalledOnce();
  });

  it("includes artistId in the song creation data", async () => {
    const createdSong = { id: "s1", ...validBody, artistId: "user-123" };
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    mockSongCreate.mockResolvedValue(createdSong);

    const app = makeApp();
    await app.request(makeRequest(validBody, "user-123"));

    expect(mockSongCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ artistId: "user-123" }),
      })
    );
  });

  it("accepts LABEL role as well as ARTIST", async () => {
    const createdSong = { id: "song-label", ...validBody, artistId: "user-label" };
    mockUser.mockResolvedValue({ id: "user-label", role: "LABEL" });
    mockSongCreate.mockResolvedValue(createdSong);

    const app = makeApp();
    const res = await app.request(makeRequest(validBody, "user-label"));
    expect(res.status).toBe(201);
  });

  it("does not pass audioMimeType to prisma song.create", async () => {
    const createdSong = { id: "s2", ...validBody, artistId: "user-123" };
    mockUser.mockResolvedValue({ id: "user-123", role: "ARTIST" });
    mockSongCreate.mockResolvedValue(createdSong);

    const app = makeApp();
    await app.request(makeRequest({ ...validBody, audioMimeType: "audio/mpeg" }));

    const callArg = mockSongCreate.mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty("audioMimeType");
  });
});
