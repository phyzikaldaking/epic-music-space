"use client";

import { useState } from "react";
import { usePlayer, type PlayerSong } from "@/contexts/PlayerContext";
import { useToast } from "@/contexts/ToastContext";

interface TrackActionsProps {
  song: PlayerSong;
}

export default function TrackActions({ song }: TrackActionsProps) {
  const { playSong, addToQueue, currentSong, isPlaying, togglePlay } = usePlayer();
  const { success } = useToast();
  const [copied, setCopied] = useState(false);

  const isCurrentSong = currentSong?.id === song.id;

  function handlePlay() {
    if (isCurrentSong) {
      togglePlay();
    } else {
      playSong(song);
    }
  }

  function handleAddToQueue() {
    addToQueue(song);
    success(`"${song.title}" added to queue`);
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // user cancelled
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handlePlay}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-accent-500/30 bg-accent-500/10 py-2.5 text-sm font-semibold text-accent-300 transition hover:bg-accent-500/20"
      >
        {isCurrentSong && isPlaying ? (
          <>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            Pause
          </>
        ) : (
          <>
            <svg className="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            {isCurrentSong ? "Resume" : "Play now"}
          </>
        )}
      </button>

      <button
        type="button"
        onClick={handleAddToQueue}
        title="Add to queue"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
        </svg>
        Queue
      </button>

      <button
        type="button"
        onClick={() => void handleShare()}
        title="Share"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        {copied ? (
          <span className="text-green-400 text-xs">Copied!</span>
        ) : (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 1 1 0-2.684m6.632 8.342a3 3 0 1 0 0-5.999 3 3 0 0 0 0 5.999zm0-14.683a3 3 0 1 0 0-5.999 3 3 0 0 0 0 5.999z" />
          </svg>
        )}
      </button>
    </div>
  );
}
