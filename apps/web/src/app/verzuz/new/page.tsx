import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import VerzuzNewClient from "./VerzuzNewClient";

export const metadata: Metadata = {
  title: "New Verzuz",
  description: "Schedule a 10-round Verzuz event with another artist or producer.",
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
        Scheduled event mode for artists and producers: pick an opponent by
        username, set a start time, then lock in 10 songs each (1 song per
        round). Fans vote round-by-round and the side with the most rounds wins.
      </p>
      <div className="mt-6">
        <VerzuzNewClient mySongs={mySongs} />
      </div>
    </div>
  );
}
