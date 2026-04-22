import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

// ─────────────────────────────────────────────────────────
// Module mocks
// ─────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  song: {
    create: vi.fn(),
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

const { songsRouter } = await import("../routes/songs");

function makeApp() {
  const app = new Hono();
  app.route("/api/song", songsRouter);
  return app;
}

function postUpload(body: unknown, userId = "artist-user-1") {
  return makeApp().request("/api/song/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ems-user-id": userId,
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: "My Track",
  artist: "DJ Test",
  audioUrl: "https://cdn.example.com/track.mp3",
  licensePrice: 9.99,
  revenueSharePct: 10,
};

const ARTIST_USER = { id: "artist-user-1", role: "ARTIST" };
const LISTENER_USER = { id: "listener-user-1", role: "LISTENER" };

// ─────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────

describe("POST /api/song/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no auth header is provided", async () => {
    const app = makeApp();
    const res = await app.request("/api/song/upload", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the authenticated user does not exist", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const res = await postUpload(VALID_BODY);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("User not found");
  });

  it("returns 403 when the user has a LISTENER role", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(LISTENER_USER);
    const res = await postUpload(VALID_BODY, "listener-user-1");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Only artists can upload songs");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const app = makeApp();
    const res = await app.request("/api/song/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ems-user-id": "artist-user-1",
      },
      body: "{{bad json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when required fields are missing (no title)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const res = await postUpload({
      artist: "DJ Test",
      audioUrl: "https://cdn.example.com/track.mp3",
      licensePrice: 9.99,
      revenueSharePct: 10,
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when audioUrl is not a valid URL", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const res = await postUpload({ ...VALID_BODY, audioUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when licensePrice is below the minimum of 0.5", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const res = await postUpload({ ...VALID_BODY, licensePrice: 0.1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when revenueSharePct exceeds 100", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const res = await postUpload({ ...VALID_BODY, revenueSharePct: 101 });
    expect(res.status).toBe(400);
  });

  it("returns 415 for a disallowed audio MIME type", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    const res = await postUpload({
      ...VALID_BODY,
      audioMimeType: "video/mp4",
    });
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Only audio files/);
  });

  it("accepts all supported audio MIME types without error", async () => {
    const supportedTypes = [
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

    for (const audioMimeType of supportedTypes) {
      mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
      mockPrisma.song.create.mockResolvedValueOnce({ id: "new-song", ...VALID_BODY });

      const res = await postUpload({ ...VALID_BODY, audioMimeType });
      expect(res.status).toBe(201);
    }
  });

  it("is case-insensitive for MIME type validation", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    mockPrisma.song.create.mockResolvedValueOnce({ id: "new-song", ...VALID_BODY });

    const res = await postUpload({ ...VALID_BODY, audioMimeType: "Audio/Mpeg" });
    expect(res.status).toBe(201);
  });

  it("returns 201 with the created song on success", async () => {
    const createdSong = { id: "new-song-123", ...VALID_BODY, artistId: "artist-user-1" };
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    mockPrisma.song.create.mockResolvedValueOnce(createdSong);

    const res = await postUpload(VALID_BODY);
    expect(res.status).toBe(201);
    const body = (await res.json()) as typeof createdSong;
    expect(body.id).toBe("new-song-123");
  });

  it("creates a song with artistId equal to the authenticated userId", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    mockPrisma.song.create.mockResolvedValueOnce({ id: "s1", ...VALID_BODY });

    await postUpload(VALID_BODY, "artist-user-1");

    expect(mockPrisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ artistId: "artist-user-1" }),
      })
    );
  });

  it("does not pass audioMimeType to the database (strips from song data)", async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(ARTIST_USER);
    mockPrisma.song.create.mockResolvedValueOnce({ id: "s1", ...VALID_BODY });

    await postUpload({ ...VALID_BODY, audioMimeType: "audio/mpeg" });

    expect(mockPrisma.song.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ audioMimeType: expect.anything() }),
      })
    );
  });
});
