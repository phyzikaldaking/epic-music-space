import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminOrCron } from "@/lib/routeAuth";

export const runtime = "nodejs";

// Admin-only: approve a DRAFT MarketingPost and execute its
// platform side. For COMMUNITY_COMMENT, this inserts a real
// TrackComment row authored by a dedicated "EMS Bot" user. SEO
// posts are already PUBLISHED by the marketing-execute cron and
// don't need approval; this endpoint refuses them. Social posts
// remain DRAFT until the OAuth provider integration ships.

const BOT_USERNAME = "ems_bot";

async function ensureBotUser(): Promise<string | null> {
  const existing = await prisma.user.findFirst({
    where: { username: BOT_USERNAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  // Create the bot user lazily. Email is a synthetic, never used
  // for sign-in (the user has no credentials provider).
  try {
    const created = await prisma.user.create({
      data: {
        email: `bot@epicmusicspace.invalid`,
        username: BOT_USERNAME,
        name: "EMS",
        emailVerified: new Date(),
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminOrCron(req);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const post = await prisma.marketingPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status !== "DRAFT") {
    return NextResponse.json(
      { error: `Post is ${post.status} — only DRAFT can be approved.` },
      { status: 409 },
    );
  }

  if (post.kind === "COMMUNITY_COMMENT") {
    const target = post.targetRef as { id?: string } | null;
    const payload = post.payload as { commentBody?: string } | null;
    if (!target?.id || !payload?.commentBody) {
      return NextResponse.json(
        { error: "Comment is missing target song or body." },
        { status: 400 },
      );
    }
    const botId = await ensureBotUser();
    if (!botId) {
      return NextResponse.json(
        { error: "Couldn't provision bot user." },
        { status: 500 },
      );
    }
    const song = await prisma.song.findUnique({
      where: { id: target.id },
      select: { id: true },
    });
    if (!song) {
      return NextResponse.json({ error: "Target song missing." }, { status: 410 });
    }
    await prisma.trackComment.create({
      data: {
        songId: song.id,
        authorId: botId,
        body: payload.commentBody.slice(0, 600),
      },
    });
    await prisma.marketingPost.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return NextResponse.json({ ok: true, kind: "comment-posted" });
  }

  // Social posts: TODO once OAuth provider adapters ship. Mark as
  // PUBLISHED so the admin's "approved" intent is recorded; the
  // actual push to Twitter/IG/TikTok will be a follow-up.
  if (
    post.kind === "SOCIAL_TWITTER" ||
    post.kind === "SOCIAL_INSTAGRAM" ||
    post.kind === "SOCIAL_TIKTOK"
  ) {
    await prisma.marketingPost.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    return NextResponse.json({
      ok: true,
      kind: "approved-pending-oauth",
      note: "Social OAuth provider not yet integrated; payload is ready for manual copy/paste.",
    });
  }

  return NextResponse.json(
    { error: `Unsupported post kind: ${post.kind}` },
    { status: 400 },
  );
}
