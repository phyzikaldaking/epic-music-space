/**
 * Integration tests for POST /api/song/upload
 *
 * Prisma, rateLimit, and auth are mocked so the tests run without a database
 * or network.  Authentication is handled through the dev-bypass path
 * (x-ems-user-id header with NEXT_PUBLIC_SUPABASE_URL unset).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ── Mocks ─────────────────────────────────────────────────────────────────

// Bypass rate limiting in all route tests
vi.mock("../middleware/rateLimit", () => ({
  rateLimit: () => async (_c: unknown, next: () => Promise<void>) => next(),
  strictLimiter: {},
  lenientLimiter: {},
}));

// Use vi.hoisted so the mock objects are available when vi.mock() is hoisted
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  song: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  licenseToken: { findFirst: vi.fn() },
  transaction: { create: vi.fn() },
}));

vi.mock("../lib/prisma", () => ({ prisma: prismaMock }));

// Import the router AFTER mocks are in place
import { songsRouter } from "../routes/songs";

// ── Test app ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.route("/api/song", songsRouter);
  return app;
}

/** Default headers for an authenticated request via dev-bypass */
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  "x-ems-user-id": "artist-user-id",
};

/** A valid upload body */
const VALID_BODY = {
  title: "Test Track",
  artist: "Test Artist",
  audioUrl: "https://cdn.example.com/track.mp3",
  licensePrice: 9.99,
  revenueSharePct: 5,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/song/upload", () => {
  beforeEach(() => {
    // Reset env so auth runs in dev-bypass mode
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    vi.clearAllMocks();
  });

  it("returns 401 when no user ID is provided", async () => {
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user is not found in the database", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/user not found/i);
  });

  it("returns 403 when the user role is LISTENER", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "LISTENER" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/only artists/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: "not-json",
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/invalid json/i);
  });

  it("returns 400 when required fields are missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ title: "No Audio" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ ...VALID_BODY, title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when audioUrl is not a valid URL", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ ...VALID_BODY, audioUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 415 when audioMimeType is not an audio type", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ ...VALID_BODY, audioMimeType: "image/png" }),
    });
    expect(res.status).toBe(415);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/only audio files/i);
  });

  it("accepts all recognised audio MIME types", async () => {
    const mimes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/flac",
      "audio/aac",
      "audio/webm",
      "audio/x-m4a",
      "audio/mp4",
    ];

    for (const mimeType of mimes) {
      prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
      prismaMock.song.create.mockResolvedValue({ id: "song-1", title: "Test Track" });
      const app = buildApp();
      const res = await app.request("/api/song/upload", {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ ...VALID_BODY, audioMimeType: mimeType }),
      });
      expect(res.status).toBe(201);
    }
  });

  it("accepts uploads without an optional audioMimeType", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    const createdSong = { id: "song-123", title: "Test Track", artistId: "artist-user-id" };
    prismaMock.song.create.mockResolvedValue(createdSong);

    const app = buildApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(VALID_BODY),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: "song-123" });
  });

  it("creates the song with the authenticated user's ID as artistId", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    prismaMock.song.create.mockResolvedValue({ id: "song-abc", artistId: "artist-user-id" });

    const app = buildApp();
    await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(VALID_BODY),
    });

    expect(prismaMock.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ artistId: "artist-user-id" }),
      })
    );
  });

  it("does not include audioMimeType in the created song data", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "artist-user-id", role: "ARTIST" });
    prismaMock.song.create.mockResolvedValue({ id: "song-456" });

    const app = buildApp();
    await app.request("/api/song/upload", {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ ...VALID_BODY, audioMimeType: "audio/mpeg" }),
    });

    const callArg = prismaMock.song.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(callArg.data).not.toHaveProperty("audioMimeType");
  });
});
