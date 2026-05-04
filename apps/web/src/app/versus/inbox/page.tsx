import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import VersusInboxClient from "./VersusInboxClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Versus inbox — Epic Music Space",
  robots: { index: false, follow: false },
};

export default async function VersusInboxPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/versus/inbox");

  const [incoming, outgoing, mySongs] = await Promise.all([
    prisma.versusChallenge.findMany({
      where: { opponentId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.versusChallenge.findMany({
      where: { challengerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.song.findMany({
      where: { artistId: session.user.id, isActive: true },
      select: { id: true, title: true, coverUrl: true },
      orderBy: { aiScore: "desc" },
      take: 25,
    }),
  ]);

  // Stitch in the songs / opponent display info (single round-trip).
  const songIds = Array.from(
    new Set(
      [...incoming, ...outgoing].flatMap((c) =>
        [c.challengerSongId, c.opponentSongId].filter((x): x is string => !!x),
      ),
    ),
  );
  const userIds = Array.from(
    new Set([...incoming, ...outgoing].flatMap((c) => [c.challengerId, c.opponentId])),
  );
  const [songs, users] = await Promise.all([
    prisma.song.findMany({
      where: { id: { in: songIds } },
      select: { id: true, title: true, artist: true, coverUrl: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, image: true, studio: { select: { username: true } } },
    }),
  ]);
  const songById = new Map(songs.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));

  function decorate(c: (typeof incoming)[number]) {
    return {
      ...c,
      challenger: userById.get(c.challengerId) ?? null,
      opponent: userById.get(c.opponentId) ?? null,
      challengerSong: songById.get(c.challengerSongId) ?? null,
      opponentSong: c.opponentSongId ? songById.get(c.opponentSongId) ?? null : null,
    };
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Versus inbox</h1>
        <Link
          href="/versus/new"
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold hover:bg-brand-600"
        >
          + Send a challenge
        </Link>
      </div>

      <VersusInboxClient
        incoming={incoming.map(decorate)}
        outgoing={outgoing.map(decorate)}
        mySongs={mySongs}
      />
    </div>
  );
}
