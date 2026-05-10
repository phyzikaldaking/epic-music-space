import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import SplitSheetEditor from "./SplitSheetEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

/**
 * Per-song split sheet editor. Restricted to the song's artist — anyone
 * else lands on /track/[id]. Lists the current entries (or shows the
 * "create from session" CTA), lets the artist drag share percentages,
 * and provides the SIGN button once shares sum to 100%.
 */
export default async function SplitSheetPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?next=/track/${id}/split-sheet`);
  }

  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      artist: true,
      artistId: true,
      coverUrl: true,
    },
  });
  if (!song) notFound();
  if (song.artistId !== session.user.id) {
    redirect(`/track/${id}`);
  }

  const sheet = await prisma.splitSheet.findUnique({
    where: { songId: id },
    include: {
      entries: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          role: true,
          shareBps: true,
          inviteEmail: true,
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <Link
          href={`/track/${song.id}`}
          className="text-xs text-white/55 hover:text-white"
        >
          ← back to track
        </Link>
        <h1 className="text-3xl font-extrabold">Split sheet</h1>
        <p className="text-sm text-white/65">
          How royalties for <span className="font-bold text-white">{song.title}</span> get
          divided. Drafts are editable; once signed, every payout flows
          through these shares.
        </p>
      </header>

      <SplitSheetEditor
        songId={song.id}
        artistName={song.artist}
        artistId={song.artistId}
        initialSheet={sheet}
      />
    </main>
  );
}
