import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudioBackdrop from "@/components/StudioBackdrop";
import SendVerzuzChallengeForm from "./SendVerzuzChallengeForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Send a Verzuz challenge — Epic Music Space",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ opponent?: string }>;
}

export default async function NewVerzuzChallengePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/verzuz/challenge/new");
  }

  const { opponent: opponentParam } = await searchParams;

  const mySongs = await prisma.song.findMany({
    where: { artistId: session.user.id, isActive: true, isLegacy: false },
    select: {
      id: true,
      title: true,
      coverUrl: true,
      genre: true,
      bpm: true,
      aiScore: true,
    },
    orderBy: { aiScore: "desc" },
    take: 50,
  });

  return (
    <div className="relative min-h-screen">
      <StudioBackdrop status="LIVE" />

      <main className="relative mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-rose-300">
            Verzuz · Cross-artist invite
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">
            Challenge an artist to a Verzuz
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">
            Pick your opponent, stage your setlist, propose a theme + start
            time. They&apos;ll get a push and an inbox card with 48 hours to
            accept (or pass). On accept the match goes live with both
            setlists locked in.
          </p>
        </div>

        {mySongs.length < 1 ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 p-6 text-amber-100 backdrop-blur-md">
            <p className="text-sm font-bold text-amber-200">
              You need at least one active track to send a Verzuz challenge.
            </p>
            <p className="mt-1 text-xs text-amber-100/75">
              Upload a track first — your setlist comes from your published
              catalog.
            </p>
            <Link
              href="/studio/new"
              className="mt-3 inline-block rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-300"
            >
              Upload a track →
            </Link>
          </div>
        ) : (
          <SendVerzuzChallengeForm
            mySongs={mySongs}
            initialOpponentUsername={opponentParam ?? ""}
          />
        )}
      </main>
    </div>
  );
}
