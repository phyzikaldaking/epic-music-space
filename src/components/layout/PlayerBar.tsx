"use client";

import { usePlayerStore } from "@/store/playerStore";
import { usePlaylistStore } from "@/store/playlistStore";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { AudioVisualizer } from "@/components/player/AudioVisualizer";
import { formatDuration } from "@/lib/api";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

export function PlayerBar() {
  useAudioPlayer(); // Mount audio engine

  const {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    toggleQueue,
  } = usePlayerStore();

  const { likeTrack, unlikeTrack, isLiked } = usePlaylistStore();

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const liked = currentTrack ? isLiked(currentTrack.id) : false;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    seek((pct / 100) * duration);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const handleLike = () => {
    if (!currentTrack) return;
    if (liked) unlikeTrack(currentTrack.id);
    else likeTrack(currentTrack);
  };

  return (
    <footer className="flex-shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-xl px-4 py-3">
      <div className="max-w-screen-2xl mx-auto flex items-center gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 w-56 md:w-64 flex-shrink-0 min-w-0">
          {currentTrack ? (
            <>
              <div className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={currentTrack.albumArt}
                  alt={currentTrack.album}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {currentTrack.title}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {currentTrack.artist}
                </p>
              </div>
              <button
                onClick={handleLike}
                className={cn(
                  "flex-shrink-0 p-1.5 rounded-full transition-colors",
                  liked ? "text-pink-400" : "text-gray-600 hover:text-gray-300"
                )}
                aria-label={liked ? "Unlike" : "Like"}
              >
                <Heart size={16} fill={liked ? "currentColor" : "none"} />
              </button>
            </>
          ) : (
            <div className="text-sm text-gray-600">Nothing playing</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-4">
            <button
              onClick={toggleShuffle}
              className={cn(
                "p-1.5 rounded-full transition-colors hidden sm:block",
                shuffle ? "text-purple-400" : "text-gray-500 hover:text-gray-300"
              )}
              aria-label="Shuffle"
            >
              <Shuffle size={16} />
            </button>
            <button
              onClick={prev}
              className="p-1.5 text-gray-300 hover:text-white transition-colors"
              aria-label="Previous"
            >
              <SkipBack size={20} />
            </button>
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-white text-black hover:scale-105 transition-transform"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              onClick={next}
              className="p-1.5 text-gray-300 hover:text-white transition-colors"
              aria-label="Next"
            >
              <SkipForward size={20} />
            </button>
            <button
              onClick={toggleRepeat}
              className={cn(
                "p-1.5 rounded-full transition-colors hidden sm:block",
                repeat !== "none"
                  ? "text-purple-400"
                  : "text-gray-500 hover:text-gray-300"
              )}
              aria-label="Repeat"
            >
              {repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2 w-full max-w-lg">
            <span className="text-xs text-gray-500 w-10 text-right tabular-nums">
              {formatDuration(Math.floor(progress))}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={progressPct}
              onChange={handleSeek}
              className="flex-1 h-1 accent-purple-500 cursor-pointer"
              aria-label="Seek"
            />
            <span className="text-xs text-gray-500 w-10 tabular-nums">
              {formatDuration(duration > 0 ? Math.floor(duration) : (currentTrack?.duration ?? 0))}
            </span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 w-40 md:w-48 justify-end flex-shrink-0">
          <div className="hidden md:block">
            <AudioVisualizer isPlaying={isPlaying} className="w-24 h-8" />
          </div>
          <button
            onClick={toggleQueue}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors hidden sm:block"
            aria-label="Queue"
          >
            <ListMusic size={16} />
          </button>
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Mute"
          >
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolume}
            className="w-20 h-1 accent-purple-500 cursor-pointer hidden sm:block"
            aria-label="Volume"
          />
        </div>
      </div>
    </footer>
  );
}
