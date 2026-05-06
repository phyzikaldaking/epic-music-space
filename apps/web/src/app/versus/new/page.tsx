import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VersusNewClient from "./VersusNewClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Send a versus challenge",
  robots: { index: false, follow: false },
};

const SCORE_BAND = 15; // ±15 AI score points = "competitive" matchup

export default async function VersusNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/versus/new");

  const mySongs = await prisma.song.findMany({
    where: { artistId: session.user.id, isActive: true },
    select: { id: true, title: true, coverUrl: true, aiScore: true, genre: true },
    orderBy: { aiScore: "desc" },
    take: 25,
  });

  if (mySongs.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-2xl font-extrabold">Upload a track first</h1>
        <p className="mt-2 text-sm text-white/55">
          Versus battles need at least one of your own tracks. Upload, then come back.
        </p>
        <Link
          href="/studio/new"
          className="mt-6 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold hover:bg-brand-600"
        >
          Upload a track
        </Link>
      </div>
    );
  }

  // Matchmaking: opponents whose top track is within ±SCORE_BAND of MY top
  // track AND in the same genre. We pick the user's top song's score as the
  // anchor and surface 8 candidate opponents.
  const anchor = mySongs[0];
  const candidateSongs = await prisma.song.findMany({
    where: {
      isActive: true,
      artistId: { not: session.user.id },
      aiScore: { gte: anchor.aiScore - SCORE_BAND, lte: anchor.aiScore + SCORE_BAND },
      ...(anchor.genre ? { genre: anchor.genre } : {}),
    },
    orderBy: { aiScore: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      coverUrl: true,
      aiScore: true,
      genre: true,
      artistId: true,
      artist_: {
        select: {
          name: true,
          studio: { select: { username: true } },
        },
      },
    },
  });

  // Group by artist so we don't show the same artist twice.
  const byArtist = new Map<string, typeof candidateSongs[number]>();
  for (const s of candidateSongs) {
    if (!byArtist.has(s.artistId)) byArtist.set(s.artistId, s);
    if (byArtist.size >= 8) break;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-extrabold">Send a versus challenge</h1>
      <p className="mb-6 text-sm text-white/55">
        Pick one of your tracks, choose an opponent, and they have 48 hours to
        accept. Once they pick a track, the battle starts and listeners vote.
      </p>

      <VersusNewClient
        mySongs={mySongs}
        suggestions={Array.from(byArtist.values()).map((s) => ({
          songId: s.id,
          songTitle: s.title,
          songCover: s.coverUrl,
          aiScore: s.aiScore,
          username: s.artist_?.studio?.username ?? null,
          artistName: s.artist_?.name ?? null,
        }))}
      />
    </div>
  );
}
