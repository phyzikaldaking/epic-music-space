"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, Pause, Heart, MessageCircle, Share2, DollarSign } from "lucide-react";
import { SongWithArtist } from "@/types/database";
import { usePlayerStore } from "@/store/playerStore";
import { useLike } from "@/hooks/useLike";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Track } from "@/types/music";

// Convert a DB Song to the player Track type
export function songToTrack(song: SongWithArtist): Track {
  return {
    id: song.id,
    title: song.title,
    artist: song.profiles?.display_name ?? song.profiles?.username ?? "Unknown",
    artistId: song.artist_id,
    album: "",
    albumId: "",
    albumArt: song.cover_url ?? `https://picsum.photos/seed/${song.id}/400/400`,
    duration: song.duration ?? 0,
    previewUrl: song.audio_url,
    genre: song.genre ?? "",
    year: new Date(song.created_at).getFullYear(),
  };
}

interface SongCardProps {
  song: SongWithArtist;
  queue?: SongWithArtist[];
}

export function SongCard({ song, queue = [] }: SongCardProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const { liked, count, toggle } = useLike(song.id, song.likes_count);
  const { user } = useAuth();

  const track = songToTrack(song);
  const queueTracks = queue.map(songToTrack);
  const isActive = currentTrack?.id === song.id;

  const handlePlay = () => {
    if (isActive) togglePlay();
    else playTrack(track, queueTracks.length > 0 ? queueTracks : [track]);
  };

  const priceLabel = () => {
    if (song.sale_type === "free") return null;
    if (song.sale_type === "fixed") return `$${song.price?.toFixed(2)}`;
    if (song.sale_type === "pwyw") return `Pay what you want`;
    if (song.sale_type === "auction") return `Bid`;
    return null;
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl overflow-hidden border transition-all duration-300",
        isActive
          ? "border-purple-500/50 bg-purple-600/10"
          : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
      )}
    >
      {/* Cover art */}
      <div className="relative aspect-square overflow-hidden">
        <Image
          src={song.cover_url ?? `https://picsum.photos/seed/${song.id}/400/400`}
          alt={song.title}
          fill
          className={cn("object-cover transition-transform duration-500", isActive && "scale-105")}
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Play overlay */}
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
        >
          <div
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-all",
              isActive
                ? "bg-purple-600 scale-100 shadow-xl shadow-purple-500/40"
                : "bg-black/50 scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100"
            )}
          >
            {isActive && isPlaying ? (
              <Pause size={24} className="text-white" />
            ) : (
              <Play size={24} className="text-white ml-0.5" fill="white" />
            )}
          </div>
        </button>

        {/* Price badge */}
        {song.sale_type !== "free" && (
          <div className="absolute top-3 left-3">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/90 text-white text-xs font-semibold shadow-lg">
              <DollarSign size={12} />
              {priceLabel()}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <Link href={`/song/${song.id}`} className="block mb-1 hover:text-purple-300 transition-colors">
          <h3 className="font-semibold text-white text-sm truncate">{song.title}</h3>
        </Link>
        <Link href={`/${song.profiles?.username}`} className="text-xs text-gray-400 hover:text-gray-200 truncate block">
          {song.profiles?.display_name ?? song.profiles?.username}
        </Link>

        {/* Actions */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggle}
              disabled={!user}
              className={cn(
                "flex items-center gap-1 text-xs transition-colors",
                liked ? "text-pink-400" : "text-gray-500 hover:text-pink-400"
              )}
              aria-label="Like"
            >
              <Heart size={14} fill={liked ? "currentColor" : "none"} />
              <span>{count}</span>
            </button>
            <Link
              href={`/song/${song.id}`}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <MessageCircle size={14} />
              <span>{song.comments_count}</span>
            </Link>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/song/${song.id}`);
            }}
            className="text-gray-600 hover:text-gray-300 transition-colors"
            aria-label="Share"
          >
            <Share2 size={14} />
          </button>
        </div>

        {/* Buy/Bid button */}
        {song.sale_type !== "free" && (
          <Link
            href={`/song/${song.id}#buy`}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600/20 border border-green-500/30 text-green-300 text-xs font-semibold hover:bg-green-600/40 transition-colors"
          >
            <DollarSign size={13} />
            {priceLabel()}
          </Link>
        )}
      </div>
    </div>
  );
}
