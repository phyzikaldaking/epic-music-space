"use client";

import { usePlayer } from "@/contexts/PlayerContext";
import { useToast } from "@/contexts/ToastContext";

interface Props {
  song: {
    id: string;
    title: string;
    artist: string;
    audioUrl: string;
    coverUrl?: string | null;
  };
  className?: string;
}

export default function AddToQueueButton({ song, className = "" }: Props) {
  const { addToQueue, playSong, currentSong, isPlaying, togglePlay } = usePlayer();
  const { success } = useToast();

  const isCurrent = currentSong?.id === song.id;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isCurrent) {
      togglePlay();
      return;
    }
    if (!currentSong) {
      playSong(song);
      success(`Now playing "${song.title}"`);
    } else {
      addToQueue(song);
      success(`"${song.title}" added to queue`);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isCurrent && isPlaying ? "Pause" : isCurrent ? "Resume" : !currentSong ? "Play now" : "Add to queue"}
      aria-label={isCurrent && isPlaying ? "Pause" : "Add to queue"}
      className={`flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white/70 backdrop-blur transition hover:border-brand-500/40 hover:bg-brand-500/15 hover:text-brand-300 ${className}`}
    >
      {isCurrent && isPlaying ? (
        <>
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
          Pause
        </>
      ) : (
        <>
          <svg className="h-3 w-3 ml-px" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {!currentSong ? "Play" : "Queue"}
        </>
      )}
    </button>
  );
}
