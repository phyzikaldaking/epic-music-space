import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { rateLimit, strictLimiter } from "../middleware/rateLimit";
import { authMiddleware } from "../middleware/auth";
import { fromBuffer } from "file-type";

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  genre: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  audioUrl: z.string().url(),
  fileBuffer: z.string().optional(),
  licensePrice: z.coerce.number().min(0.5).max(100000),
  revenueSharePct: z.coerce.number().min(0.01).max(100),
  totalLicenses: z.coerce.number().int().min(1).max(10000).default(100)
});

export const songsRouter = new Hono();

songsRouter.post("/upload", rateLimit(strictLimiter), authMiddleware, async (c) => {
  const body = await c.req.json();
  const parsed = uploadSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { fileBuffer, ...songData } = parsed.data;

  // 🔒 REAL FILE VALIDATION
  if (fileBuffer) {
    const buffer = Buffer.from(fileBuffer, "base64");
    const type = await fromBuffer(buffer);

    const allowed = ["audio/mpeg","audio/wav","audio/flac","audio/mp4"];
    if (!type || !allowed.includes(type.mime)) {
      return c.json({ error: "Invalid audio file" }, 400);
    }
  }

  const song = await prisma.song.create({
    data: songData
  });

  return c.json(song, 201);
});
