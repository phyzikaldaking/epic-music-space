import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

export const runtime = "nodejs";

const schema = z.object({
  songId: z.string().min(1).max(40),
  // Platform shapes the caption tone + length (Twitter ≈ 240 chars,
  // Instagram leans punchier + more emoji, TikTok very short).
  platform: z.enum(["twitter", "instagram", "tiktok"]).optional().default("twitter"),
});

// One-click promo kit caption generator. Pulls the song's metadata
// from Prisma (with ownership check so a random user can't ask the AI
// to write captions for someone else's catalog), feeds it to
// gpt-4o-mini, returns a caption + 3 hashtags. ~$0.0001 per call.
// Per-user rate-limited so abuse can't drain the OpenAI budget.

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`ai:promo-caption:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 4 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);
  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }
  const { songId, platform } = parsed.data;

  // Ownership check — only the artist can promote their own song.
  // Using findFirst with artistId filter so a foreign songId returns
  // 404, not 403, so we don't leak which IDs exist.
  const song = await prisma.song
    .findFirst({
      where: { id: songId, artistId: session.user.id },
      select: {
        title: true,
        genre: true,
        bpm: true,
        key: true,
        licensePrice: true,
        revenueSharePct: true,
        aiScore: true,
        soldLicenses: true,
        totalLicenses: true,
      },
    })
    .catch(() => null);
  if (!song) {
    return jsonWithRequestId(requestId, { error: "Not found" }, { status: 404 });
  }

  const client = openai;
  if (!client) {
    return jsonWithRequestId(
      requestId,
      { error: "AI is offline." },
      { status: 503 },
    );
  }

  const platformGuide =
    platform === "tiktok"
      ? "TikTok: under 150 chars, punchy, casual, max 1 emoji."
      : platform === "instagram"
        ? "Instagram: 1–2 sentences, vivid, 2–4 emoji ok."
        : "Twitter/X: under 240 chars, sharp, max 1 emoji.";

  const songSummary = JSON.stringify(
    {
      title: song.title,
      genre: song.genre,
      bpm: song.bpm,
      key: song.key,
      licensePrice: Number(song.licensePrice),
      revenueSharePct: Number(song.revenueSharePct),
      aiScore: Number(song.aiScore.toFixed(1)),
      licensesClaimed: `${song.soldLicenses}/${song.totalLicenses}`,
    },
    null,
    0,
  );

  const result = await withRouteTimeout("ai-promo-caption", 12_000, async (signal) => {
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You write share captions for music artists promoting their tracks on Epic Music Space. Return STRICT JSON: { caption: string, hashtags: string[] }. The caption should be platform-appropriate, drive a license click, and never mention 'royalties' (legal-sensitive). hashtags is an array of 3 lowercase tags without the # prefix.",
          },
          {
            role: "user",
            content: `Song (JSON): ${songSummary}\n\nPlatform guidance: ${platformGuide}\n\nReturn JSON only.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.8,
        response_format: { type: "json_object" },
      },
      { signal },
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    try {
      const parsedOut = JSON.parse(raw) as {
        caption?: string;
        hashtags?: string[];
      };
      const caption = parsedOut.caption?.trim() || `New track: ${song.title}`;
      const hashtags = Array.isArray(parsedOut.hashtags)
        ? parsedOut.hashtags
            .filter((h): h is string => typeof h === "string")
            .map((h) => h.replace(/^#/, "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 5)
        : [];
      return { caption, hashtags };
    } catch {
      return {
        caption: `New track: ${song.title}`,
        hashtags: ["newmusic", "indie", "ems"],
      };
    }
  });
  if (!result.ok) {
    return withRequestId(result.response, requestId);
  }

  return jsonWithRequestId(requestId, result.value);
}
