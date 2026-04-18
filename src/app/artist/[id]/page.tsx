"use client";

import { notFound } from "next/navigation";
import Image from "next/image";
import { use } from "react";
import { Play, Users } from "lucide-react";
import { getArtist, getArtistTracks, getArtistAlbums, formatListeners } from "@/lib/api";
import { TrackRow } from "@/components/ui/TrackRow";
import { Badge } from "@/components/ui/Badge";
import { usePlayerStore } from "@/store/playerStore";
import Link from "next/link";

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const artist = getArtist(id);
  if (!artist) notFound();

  const artistTracks = getArtistTracks(id);
  const artistAlbums = getArtistAlbums(id);
  const { playTrack } = usePlayerStore();

  return (
    <div className="pb-8">
      {/* Artist header */}
      <div className="relative h-64 md:h-80">
        <Image
          src={artist.image}
          alt={artist.name}
          fill
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/50 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-end gap-4">
            <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white/20 flex-shrink-0">
              <Image
                src={artist.image}
                alt={artist.name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Artist</p>
              <h1 className="text-3xl md:text-5xl font-bold text-white">{artist.name}</h1>
              <p className="text-gray-300 mt-1 flex items-center gap-1">
                <Users size={14} />
                {formatListeners(artist.monthlyListeners)} monthly listeners
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Play button + genres */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => artistTracks[0] && playTrack(artistTracks[0], artistTracks)}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-full hover:bg-purple-500 transition-colors"
          >
            <Play size={18} fill="white" />
            Play
          </button>
          <div className="flex gap-2 flex-wrap">
            {artist.genres.map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>
        </div>

        {/* Bio */}
        {artist.bio && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">About</h2>
            <p className="text-gray-400 max-w-2xl leading-relaxed">{artist.bio}</p>
          </section>
        )}

        {/* Popular Tracks */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Popular</h2>
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            {artistTracks.slice(0, 5).map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={artistTracks} />
            ))}
          </div>
        </section>

        {/* Albums */}
        {artistAlbums.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {artistAlbums.map((album) => (
                <Link
                  key={album.id}
                  href={`/album/${album.id}`}
                  className="group rounded-xl bg-white/5 border border-white/10 overflow-hidden hover:bg-white/10 transition-all"
                >
                  <div className="relative aspect-square">
                    <Image
                      src={album.coverArt}
                      alt={album.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                      unoptimized
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-white truncate">{album.title}</p>
                    <p className="text-xs text-gray-400">{album.releaseDate.slice(0, 4)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
