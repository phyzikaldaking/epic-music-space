import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueNotification } from "@/lib/queues";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await moderateLimiter.consume(`post-like:${ip}`);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, isPublished: true, authorId: true, body: true },
  });
  if (!post || !post.isPublished) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId: id, userId: session.user.id } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    const count = await prisma.postLike.count({ where: { postId: id } });
    return NextResponse.json({ liked: false, count });
  }

  await prisma.postLike.create({
    data: { postId: id, userId: session.user.id },
  });

  // Notify the post author — but never on self-likes, and best-effort only
  // (a queue failure must not block the optimistic UI update).
  if (post.authorId !== session.user.id) {
    void (async () => {
      try {
        const liker = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { name: true },
        });
        const likerName = liker?.name ?? "Someone";
        const snippet = post.body.length > 80 ? `${post.body.slice(0, 80)}…` : post.body;
        await enqueueNotification({
          userId: post.authorId,
          type: "POST_LIKED",
          title: `${likerName} liked your post`,
          body: snippet || "Tap to view",
          metadata: { postId: post.id, fromUserId: session.user.id },
        });
      } catch (err) {
        console.warn("[posts:like] notify failed", err);
      }
    })();
  }

  const count = await prisma.postLike.count({ where: { postId: id } });
  return NextResponse.json({ liked: true, count });
}
