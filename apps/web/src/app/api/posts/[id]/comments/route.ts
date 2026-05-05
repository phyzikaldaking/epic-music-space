import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { strictLimiter, moderateLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";
import { validateTrustSafetyInput } from "@/lib/trustSafety";

const commentSchema = z.object({
  body: z.string().min(1).max(1000),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`comments-list:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  // Cursor-based pagination on createdAt asc. Page size capped at 100,
  // default 25 — small enough that the first paint stays fast on long
  // threads, large enough that most posts fit in a single page.
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 25)));
  const cursor = url.searchParams.get("cursor");

  // Filter blocked authors out of the thread for the viewer (and viewers
  // who have been blocked never see the blocker's comments either).
  const session = await auth();
  const viewerId = session?.user?.id ?? null;
  let blockedAuthorIds: string[] = [];
  if (viewerId) {
    const [outgoing, incoming] = await Promise.all([
      prisma.userBlock.findMany({
        where: { blockerId: viewerId },
        select: { blockedId: true },
      }),
      prisma.userBlock.findMany({
        where: { blockedId: viewerId },
        select: { blockerId: true },
      }),
    ]);
    blockedAuthorIds = [
      ...outgoing.map((b) => b.blockedId),
      ...incoming.map((b) => b.blockerId),
    ];
  }

  const comments = await prisma.postComment.findMany({
    where: {
      postId: id,
      ...(blockedAuthorIds.length ? { authorId: { notIn: blockedAuthorIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          studio: { select: { username: true } },
        },
      },
    },
  });

  let nextCursor: string | null = null;
  if (comments.length > limit) {
    const last = comments.pop()!;
    nextCursor = last.id;
  }

  return NextResponse.json({ comments, nextCursor });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await strictLimiter.consume(`comment-create:ip:${ip}`);
  } catch {
    return NextResponse.json(
      { error: "Commenting too quickly." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Per-(user,post) limit — caps how fast one identity can flood one
  // thread. The IP limiter above is the floor; this is the ceiling on
  // any single account's blast radius.
  try {
    await strictLimiter.consume(`comment-create:user:${session.user.id}:${id}`);
  } catch {
    return NextResponse.json(
      { error: "Slow down on this thread." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, isPublished: true, authorId: true },
  });
  if (!post || !post.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Refuse comments if a block is in place between the commenter and the
  // post author. Either direction blocks — the commenter shouldn't be able
  // to ping someone who blocked them, and a viewer who blocked the author
  // shouldn't expect their reply to be a friendly conversation.
  if (post.authorId !== session.user.id) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: post.authorId },
          { blockerId: post.authorId, blockedId: session.user.id },
        ],
      },
      select: { id: true },
    });
    if (block) {
      return NextResponse.json(
        { error: "You can't comment on this post." },
        { status: 403 },
      );
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = commentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const trustSafety = validateTrustSafetyInput(parsed.data.body);
  if (!trustSafety.ok) {
    return NextResponse.json(
      { error: trustSafety.message, code: trustSafety.code },
      { status: 400 },
    );
  }

  const comment = await prisma.postComment.create({
    data: {
      postId: id,
      authorId: session.user.id,
      body: parsed.data.body,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          image: true,
          studio: { select: { username: true } },
        },
      },
    },
  });

  // Notify the post author of the new comment — best-effort, never blocks
  // the response. Skip self-comments.
  if (post.authorId !== session.user.id) {
    void (async () => {
      try {
        const commenterName = comment.author.name ?? "Someone";
        const snippet =
          parsed.data.body.length > 140
            ? `${parsed.data.body.slice(0, 140)}…`
            : parsed.data.body;
        await enqueueNotification({
          userId: post.authorId,
          type: "POST_COMMENTED",
          title: `${commenterName} commented on your post`,
          body: snippet,
          metadata: { postId: post.id, commentId: comment.id, fromUserId: session.user.id },
        });
      } catch (err) {
        console.warn("[posts:comment] notify failed", err);
      }
    })();
  }

  return NextResponse.json({ comment }, { status: 201 });
}
