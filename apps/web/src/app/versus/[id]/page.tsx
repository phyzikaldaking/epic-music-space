import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import VersusResultCard from "./VersusResultCard";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const match = await prisma.versusMatch.findUnique({
    where: { id },
    include: {
      songA: { select: { title: true, artist: true } },
      songB: { select: { title: true, artist: true } },
    },
  });
  if (!match) return { title: "Battle Not Found" };

  const title = `${match.songA.title} vs ${match.songB.title} — EMS Versus`;
  const desc =
    match.status === "COMPLETED"
      ? `See who won the battle between ${match.songA.artist} and ${match.songB.artist} on Epic Music Space.`
      : `Vote now: ${match.songA.title} by ${match.songA.artist} vs ${match.songB.title} by ${match.songB.artist}`;

  return {
    title,
    description: desc,
    openGraph: { title, description: desc },
    twitter: { card: "summary_large_image", title, description: desc },
  };
}

export default async function VersusResultPage({ params }: Props) {
  const { id } = await params;

  const match = await prisma.versusMatch.findUnique({
    where: { id },
    include: {
      songA: {
        select: {
          id: true, title: true, artist: true, coverUrl: true,
          audioUrl: true, aiScore: true, artistId: true,
        },
      },
      songB: {
        select: {
          id: true, title: true, artist: true, coverUrl: true,
          audioUrl: true, aiScore: true, artistId: true,
        },
      },
    },
  });

  if (!match) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <VersusResultCard match={match} />
    </div>
  );
}
