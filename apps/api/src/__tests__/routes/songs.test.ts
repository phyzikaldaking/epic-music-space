import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mock @ems/db ───────────────────────────────────────────────────────────────
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

// ── Mock rate limiting ─────────────────────────────────────────────────────────
vi.mock("../../middleware/rateLimit", () => ({
  rateLimit: () => (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

import { prisma } from "@ems/db";
import { songsRouter } from "../../routes/songs";

function buildApp(userId = "artist-user-id") {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const id = c.req.header("x-ems-user-id");
    if (!id) return c.json({ error: "Unauthorized" }, 401);
    c.set("userId", id);
    await next();
  });
  app.route("/api/song", songsRouter);
  return app;
}

const validUploadBody = {
  title: "My New Track",
  artist: "DJ Cool",
  genre: "Electronic",
  description: "A banger",
  audioUrl: "https://cdn.example.com/track.mp3",
  coverUrl: "https://cdn.example.com/cover.jpg",
  bpm: 128,
  key: "Am",
  licensePrice: 9.99,
  revenueSharePct: 10,
  totalLicenses: 100,
};

describe("POST /api/song/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("returns 404 when user does not exist in database", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "ghost-user",
      },
      body: JSON.stringify(validUploadBody),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "User not found" });
  });

  it("returns 403 when user role is LISTENER", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "listener-id",
      role: "LISTENER",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "listener-id",
      },
      body: JSON.stringify(validUploadBody),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Only artists can upload songs" });
  });

  it("returns 400 for invalid JSON body", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: "not-valid-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Invalid JSON body" });
  });

  it("returns 400 when required fields are missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify({ title: "No audio url here" }), // missing required fields
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 when audioUrl is not a valid URL", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify({
        ...validUploadBody,
        audioUrl: "not-a-url",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when licensePrice is below minimum (0.5)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify({ ...validUploadBody, licensePrice: 0.1 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 415 when audioMimeType is not an audio type", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify({
        ...validUploadBody,
        audioMimeType: "image/jpeg",
      }),
    });
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body).toMatchObject({
      error: "Only audio files are allowed (mp3, wav, ogg, flac, aac, m4a)",
    });
  });

  it("accepts all valid audio MIME types", async () => {
    const validMimes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/wave",
      "audio/ogg",
      "audio/flac",
      "audio/aac",
      "audio/webm",
      "audio/x-m4a",
      "audio/mp4",
    ];

    const mockSong = { id: "new-song", ...validUploadBody, artistId: "artist-id" };
    vi.mocked(prisma.song.create).mockResolvedValue(mockSong as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);

    const app = buildApp();

    for (const mime of validMimes) {
      vi.mocked(prisma.song.create).mockClear();
      const res = await app.request("/api/song/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ems-user-id": "artist-id",
        },
        body: JSON.stringify({ ...validUploadBody, audioMimeType: mime }),
      });
      expect(res.status, `Expected 201 for MIME type: ${mime}`).toBe(201);
    }
  });

  it("returns 201 and creates a song for a valid artist upload", async () => {
    const mockSong = {
      id: "song-new-123",
      ...validUploadBody,
      artistId: "artist-id",
      isActive: true,
      createdAt: new Date(),
    };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue(mockSong as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify(validUploadBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect((body as { id: string }).id).toBe("song-new-123");

    // Verify prisma.song.create was called with the right data
    expect(prisma.song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "My New Track",
        artist: "DJ Cool",
        artistId: "artist-id",
      }),
    });
  });

  it("does not include audioMimeType in the created song data", async () => {
    const mockSong = { id: "song-mime-test", ...validUploadBody, artistId: "artist-id" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "artist-id",
      role: "ARTIST",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue(mockSong as never);

    const app = buildApp();
    await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-id",
      },
      body: JSON.stringify({ ...validUploadBody, audioMimeType: "audio/mpeg" }),
    });

    const createCall = vi.mocked(prisma.song.create).mock.calls[0];
    expect(createCall?.[0]?.data).not.toHaveProperty("audioMimeType");
  });

  it("allows ADMIN role to upload songs", async () => {
    const mockSong = { id: "admin-song", ...validUploadBody, artistId: "admin-id" };
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-id",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.song.create).mockResolvedValue(mockSong as never);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "admin-id",
      },
      body: JSON.stringify(validUploadBody),
    });
    expect(res.status).toBe(201);
  });
});
