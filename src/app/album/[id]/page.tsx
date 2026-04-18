"use client";

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";
import { Play, Calendar, Music2 } from "lucide-react";
import { getAlbum, getAlbumTracks, formatDuration } from "@/lib/api";
import { TrackRow } from "@/components/ui/TrackRow";
import { Badge } from "@/components/ui/Badge";
import { usePlayerStore } from "@/store/playerStore";

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const album = getAlbum(id);
  if (!album) notFound();

  const albumTracks = getAlbumTracks(id);
  const totalDuration = albumTracks.reduce((sum, t) => sum + t.duration, 0);
  const { playTrack } = usePlayerStore();

  return (
    <div className="pb-8">
      {/* Album header */}
      <div className="p-6 flex flex-col sm:flex-row gap-6 items-start">
        <div className="relative w-48 h-48 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl shadow-purple-500/20">
          <Image
            src={album.coverArt}
            alt={album.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Album</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{album.title}</h1>
          <Link
            href={`/artist/${album.artistId}`}
            className="text-purple-300 hover:text-purple-200 font-medium mb-3"
          >
            {album.artist}
          </Link>
          <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {album.releaseDate}
            </span>
            <span className="flex items-center gap-1">
              <Music2 size={14} />
              {albumTracks.length} songs
            </span>
            <span>{formatDuration(totalDuration)}</span>
            <Badge>{album.genre}</Badge>
          </div>
          <button
            onClick={() => albumTracks[0] && playTrack(albumTracks[0], albumTracks)}
            className="mt-4 flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-full hover:bg-purple-500 transition-colors w-fit"
          >
            <Play size={18} fill="white" />
            Play Album
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="px-6">
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          {albumTracks.map((track, i) => (
            <TrackRow key={track.id} track={track} index={i} queue={albumTracks} showAlbumArt={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
