import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const bodySchema = z.object({
  // Optional explicit toggle. When omitted, "share=true + no existing
  // token" issues a fresh token.
  isPublic: z.boolean().optional(),
  // Force a new shareToken (used by "Regenerate link" UI to invalidate
  // anyone who already had the old URL).
  rotate: z.boolean().optional(),
});

function newShareToken() {
  // 16 bytes of base64url ⇒ 22 chars, ~128 bits of entropy. Plenty for
  // unguessable share URLs without bloating the URL bar.
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * POST /api/playlists/:id/share
 * Owner-only. Mints (or rotates) a share token and toggles public visibility.
 *
 * Default behavior (empty body): make the playlist public, ensuring it
 * has a share token. With `{ isPublic: false }`: take it private but
 * keep the token around so re-publishing returns the same URL.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const wantPublic = parsed.data.isPublic ?? true;
  const wantRotate = parsed.data.rotate ?? false;

  let nextToken = playlist.shareToken;
  if (wantPublic && (!nextToken || wantRotate)) {
    nextToken = newShareToken();
  }

  const updated = await prisma.playlist.update({
    where: { id },
    data: {
      isPublic: wantPublic,
      shareToken: nextToken,
    },
  });

  return NextResponse.json({
    id: updated.id,
    isPublic: updated.isPublic,
    shareToken: updated.shareToken,
  });
}
