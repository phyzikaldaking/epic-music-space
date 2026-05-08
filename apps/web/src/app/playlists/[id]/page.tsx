import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStreamUrl } from "@/lib/audioStream";
import PlaylistDetailClient from "./PlaylistDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    select: { name: true, description: true, isPublic: true },
  });
  if (!playlist) return { title: "Playlist" };
  return {
    title: playlist.name,
    description:
      playlist.description ?? `${playlist.name} — a playlist on Epic Music Space.`,
    robots: playlist.isPublic
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function PlaylistDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) notFound();

  const isOwner = session?.user?.id === playlist.ownerId;
  if (!playlist.isPublic && !isOwner) notFound();

  const [tracks, owner] = await Promise.all([
    prisma.playlistTrack.findMany({
      where: { playlistId: id },
      orderBy: [{ position: "asc" }, { addedAt: "asc" }],
    }),
    prisma.user.findUnique({
      where: { id: playlist.ownerId },
      select: { id: true, name: true, username: true, image: true },
    }),
  ]);

  const songs = tracks.length
    ? await prisma.song.findMany({
        where: { id: { in: tracks.map((t) => t.songId) }, isActive: true },
      })
    : [];
  const bySongId = new Map(songs.map((s) => [s.id, s]));

  const items = tracks
    .map((t) => {
      const song = bySongId.get(t.songId);
      if (!song) return null;
      return {
        id: t.id,
        position: t.position,
        addedAt: t.addedAt.toISOString(),
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
          coverUrl: song.coverUrl,
          streamUrl: getStreamUrl(song.id),
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <Link
          href="/playlists"
          className="text-xs font-bold uppercase tracking-widest text-white/45 hover:text-white/75"
        >
          ← Playlists
        </Link>
      </div>

      <PlaylistDetailClient
        playlist={{
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          coverUrl: playlist.coverUrl,
          isPublic: playlist.isPublic,
          shareToken: playlist.shareToken,
          isOwner,
          owner: owner
            ? {
                id: owner.id,
                name: owner.name,
                username: owner.username,
                image: owner.image,
              }
            : null,
        }}
        tracks={items}
      />
    </div>
  );
}
