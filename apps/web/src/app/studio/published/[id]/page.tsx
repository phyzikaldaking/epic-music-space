import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PublishedCelebration from "./PublishedCelebration";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track published 🎉 — Epic Music Space",
  robots: { index: false },
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PublishedPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/studio/published/${id}`)}`);
  }

  const song = await prisma.song.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      artist: true,
      coverUrl: true,
      audioUrl: true,
      licensePrice: true,
      isActive: true,
    },
  });
  if (!song) notFound();

  // Get the user's vanity url so we can build a clean share link to
  // their profile if they want.
  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  });

  return (
    <PublishedCelebration
      song={{
        id: song.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl,
        audioUrl: song.audioUrl,
        licensePrice: Number(song.licensePrice),
      }}
      studioUsername={studio?.username ?? null}
    />
  );
}
