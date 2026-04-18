"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/store/playerStore";

export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    progress,
    repeat,
    setProgress,
    setDuration,
    next,
  } = usePlayerStore();

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      setProgress(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };
    const handleEnded = () => {
      if (usePlayerStore.getState().repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        next();
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack?.previewUrl) {
      audio.src = currentTrack.previewUrl;
      if (isPlaying) {
        audio.play().catch(() => {});
      }
    } else {
      audio.src = "";
      // Still simulate progress for demo tracks without preview URLs
      if (isPlaying) {
        setDuration(currentTrack?.duration ?? 240);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // Handle play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      if (audio.src) {
        audio.play().catch(() => {});
      }
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Handle volume
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  // Handle seek from store (when progress jumps significantly)
  const lastProgressRef = useRef(0);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const diff = Math.abs(progress - lastProgressRef.current);
    // Only seek if the jump is user-initiated (large difference)
    if (diff > 1.5 && Math.abs(audio.currentTime - progress) > 1) {
      audio.currentTime = progress;
    }
    lastProgressRef.current = progress;
  }, [progress]);

  // Handle repeat
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = repeat === "one";
  }, [repeat]);

  return audioRef;
}
