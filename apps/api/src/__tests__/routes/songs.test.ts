import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────

vi.mock("@ems/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    song: {
      create: vi.fn(),
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

async function getApp(userId = "test-artist-1") {
  const { songsRouter } = await import("../../routes/songs");
  const app = new Hono();
  app.use("*", (c, next) => {
    c.set("userId", userId);
    return next();
  });
  app.route("/api/song", songsRouter);
  return app;
}

async function postUpload(body: unknown, userId?: string) {
  const app = await getApp(userId);
  return app.request("/api/song/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId ?? "test-artist-1",
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: "My Track",
  artist: "DJ Test",
  genre: "Electronic",
  audioUrl: "https://cdn.example.com/track.mp3",
  licensePrice: 9.99,
  revenueSharePct: 5,
  totalLicenses: 100,
};

// ─────────────────────────────────────────────────────────
// POST /api/song/upload
// ─────────────────────────────────────────────────────────

describe("POST /api/song/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 400 for invalid JSON body", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);

    const app = await getApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ems-user-id": "test-artist-1" },
      body: "{{bad json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 when required fields are missing", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);

    const res = await postUpload({ title: "Only Title" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when user does not exist", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await postUpload(validBody);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/user not found/i);
  });

  it("returns 403 when user role is LISTENER", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "LISTENER",
    } as never);

    const res = await postUpload(validBody);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/only artists/i);
  });

  it("returns 415 for a non-audio MIME type", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);

    const res = await postUpload({ ...validBody, audioMimeType: "image/jpeg" });
    expect(res.status).toBe(415);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/only audio/i);
  });

  it("creates the song and returns 201 for a valid ARTIST request", async () => {
    const { prisma } = await import("@ems/db");
    const createdSong = {
      id: "new-song-1",
      title: "My Track",
      artist: "DJ Test",
      artistId: "test-artist-1",
      isActive: true,
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue(createdSong as never);

    const res = await postUpload(validBody);
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string };
    expect(body.id).toBe("new-song-1");
    expect(vi.mocked(prisma.song.create)).toHaveBeenCalledOnce();
  });

  it("accepts valid audio MIME types without rejecting", async () => {
    const { prisma } = await import("@ems/db");
    const createdSong = { id: "song-2", title: "My Track" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue(createdSong as never);

    const audioTypes = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/aac"];
    for (const audioMimeType of audioTypes) {
      vi.mocked(prisma.song.create).mockResolvedValue(createdSong as never);
      const res = await postUpload({ ...validBody, audioMimeType });
      expect(res.status).toBe(201);
    }
  });

  it("accepts upload without audioMimeType field", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue({ id: "song-3" } as never);

    const { audioMimeType: _, ...bodyWithoutMime } = { ...validBody, audioMimeType: undefined };
    const res = await postUpload(bodyWithoutMime);
    expect(res.status).toBe(201);
  });

  it("rejects licensePrice below minimum (0.5)", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);

    const res = await postUpload({ ...validBody, licensePrice: 0.1 });
    expect(res.status).toBe(400);
  });

  it("rejects revenueSharePct above 100", async () => {
    const { prisma } = await import("@ems/db");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "test-artist-1",
      role: "ARTIST",
    } as never);

    const res = await postUpload({ ...validBody, revenueSharePct: 101 });
    expect(res.status).toBe(400);
  });
});
