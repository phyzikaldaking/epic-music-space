import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@ems/db";
import { rateLimit, strictLimiter } from "../middleware/rateLimit";
import { authMiddleware } from "../middleware/auth";

const voteSchema = z.object({
  matchId: z.string().min(1, "matchId is required"),
  votedSongId: z.string().min(1, "votedSongId is required"),
});

export const versusRouter = new Hono();

/**
 * POST /api/versus/vote
 * Cast or update a vote in an active versus match.
 * Each user can vote once per match; they may change their vote while the match
 * is still active.  Vote counts are recalculated after each upsert.
 *
 * Body: { matchId: string; votedSongId: string }
 * Auth: Bearer token required
 */
versusRouter.post(
  "/vote",
  rateLimit(strictLimiter),
  authMiddleware,
  async (c) => {
    const userId: string = c.get("userId");

    // ── Parse body ─────────────────────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = voteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        400
      );
    }

    const { matchId, votedSongId } = parsed.data;

    // ── Fetch match ────────────────────────────────────────────────────────
    const match = await prisma.versusMatch.findUnique({ where: { id: matchId } });
    if (!match) {
      return c.json({ error: "Match not found" }, 404);
    }
    if (match.status === "COMPLETED") {
      return c.json({ error: "This match has ended" }, 409);
    }
    if (match.endsAt < new Date()) {
      // Auto-close
      await prisma.versusMatch.update({
        where: { id: matchId },
        data: { status: "COMPLETED" },
      });
      return c.json({ error: "This match has ended" }, 409);
    }
    if (votedSongId !== match.songAId && votedSongId !== match.songBId) {
      return c.json(
        { error: "votedSongId must be one of the two songs in this match" },
        400
      );
    }

    // ── Upsert vote ────────────────────────────────────────────────────────
    await prisma.versusVote.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId, votedSongId },
      update: { votedSongId },
    });

    // ── Recount ────────────────────────────────────────────────────────────
    const [votesA, votesB] = await Promise.all([
      prisma.versusVote.count({ where: { matchId, votedSongId: match.songAId } }),
      prisma.versusVote.count({ where: { matchId, votedSongId: match.songBId } }),
    ]);

    const updated = await prisma.versusMatch.update({
      where: { id: matchId },
      data: { votesA, votesB },
    });

    return c.json({ matchId, votesA: updated.votesA, votesB: updated.votesB });
  }
);
