import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { moderateLimiter } from "@/lib/rateLimit";
import { advanceMatchIfNeeded } from "@/lib/verzuz";
import { createServerSupabaseClient, CHANNELS } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  emoji: z.enum(["🔥", "👏", "🐐", "💥", "😤", "🎤", "🎸", "🥁", "🎧"]),
});

/**
 * POST /api/verzuz/[id]/reaction
 *
 * Lightweight live reaction for the currently-live round. Broadcast only
 * (no DB write) so big events don't create unbounded storage.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: matchId } = await params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  try {
    await moderateLimiter.consume(`verzuz-react:user:${session.user.id}:${matchId}`);
    await moderateLimiter.consume(`verzuz-react:ip:${ip}:${matchId}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on reactions. Try again in a moment." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const match = await advanceMatchIfNeeded(matchId);
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status !== "LIVE") {
    return NextResponse.json({ error: "Reactions are only available while live." }, { status: 409 });
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ ok: true, realtime: false });
  }

  // Best-effort broadcast; never block the response on flaky realtime.
  void (async () => {
    try {
      await supabase.channel(CHANNELS.versus(matchId)).send({
        type: "broadcast",
        event: "verzuz_reaction",
        payload: {
          matchId,
          roundNumber: match.currentRound,
          emoji: parsed.data.emoji,
        },
      });
    } catch {
      /* ignore */
    }
  })();

  return NextResponse.json({ ok: true, realtime: true });
}

