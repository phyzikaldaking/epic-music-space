import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VerzuzNewClient from "./VerzuzNewClient";

export const metadata: Metadata = {
  title: "New Verzuz — Epic Music Space",
  description: "Set up a 10-round Verzuz battle with another artist.",
};

export default async function VerzuzNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/verzuz/new");

  const mySongs = await prisma.song.findMany({
    where: { artistId: session.user.id, isActive: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, coverUrl: true, genre: true },
  });

  if (mySongs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-5xl">🎙️</p>
        <h1 className="mt-3 text-3xl font-extrabold">Upload first, Verzuz second</h1>
        <p className="mt-2 text-sm text-white/55">
          You need at least one active track to start a Verzuz. Drop something
          on{" "}
          <Link href="/studio/new" className="text-brand-400 hover:underline">
            /studio/new
          </Link>{" "}
          and come back.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-widest text-gold-300">
        Verzuz · 10-round artist showdown
      </p>
      <h1 className="mt-2 text-3xl font-extrabold text-gradient-ems">
        Stage a Verzuz
      </h1>
      <p className="mt-2 text-sm text-white/55">
        Pick an opponent by username, then choose up to 10 of your songs to
        line up against 10 of theirs. Fans vote round-by-round, the winner of
        each round earns a point, the artist with the most rounds takes the
        match.
      </p>
      <div className="mt-6">
        <VerzuzNewClient mySongs={mySongs} />
      </div>
    </div>
  );
}
