import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkStemAccess } from "@/lib/stemAccess";

/**
 * GET /api/songs/[id]/stems
 *
 * Returns the current stem-separation state for a song.
 *
 * Response shape:
 *   {
 *     status: "NONE" | "QUEUED" | "PROCESSING" | "READY" | "FAILED",
 *     stems?: { vocals, drums, bass, other },   // present iff status === "READY"
 *     error?: string,                            // present iff status === "FAILED"
 *     access: "artist" | "license_holder" | "admin" | "denied" | "song_not_found"
 *   }
 *
 * 401 if anonymous; 403 if no access; 404 if song missing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const access = await checkStemAccess(id, session.user.id, session.user.role ?? null);
  if (access.reason === "song_not_found") {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  if (!access.ok) {
    return NextResponse.json(
      { error: "Stem access requires holding a license to this track." },
      { status: 403 },
    );
  }

  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      stemSeparationStatus: true,
      stemSeparationError: true,
      stemFiles: true,
    },
  });
  if (!song) return NextResponse.json({ error: "Song not found" }, { status: 404 });

  const isReady = song.stemSeparationStatus === "READY" && song.stemFiles;
  return NextResponse.json(
    {
      status: song.stemSeparationStatus,
      stems: isReady ? song.stemFiles : undefined,
      error:
        song.stemSeparationStatus === "FAILED"
          ? song.stemSeparationError ?? "separation failed"
          : undefined,
      access: access.reason,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
