import { create } from "zustand";
import { Track, RepeatMode } from "@/types/music";

interface PlayerState {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  showQueue: boolean;

  // Actions
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (progress: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (track: Track) => void;
  toggleQueue: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  volume: 0.8,
  progress: 0,
  duration: 0,
  shuffle: false,
  repeat: "none",
  showQueue: false,

  playTrack: (track, queue) =>
    set((state) => {
      const newQueue = queue || state.queue;
      const idx = newQueue.findIndex((t) => t.id === track.id);
      return {
        currentTrack: track,
        queue: newQueue,
        queueIndex: idx >= 0 ? idx : 0,
        isPlaying: true,
        progress: 0,
      };
    }),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),

  next: () =>
    set((state) => {
      const { queue, queueIndex, shuffle, repeat } = state;
      if (queue.length === 0) return {};
      if (repeat === "one") return { progress: 0 };
      let nextIdx: number;
      if (shuffle) {
        nextIdx = Math.floor(Math.random() * queue.length);
      } else {
        nextIdx = queueIndex + 1;
        if (nextIdx >= queue.length) {
          if (repeat === "all") nextIdx = 0;
          else return { isPlaying: false };
        }
      }
      return {
        currentTrack: queue[nextIdx],
        queueIndex: nextIdx,
        progress: 0,
        isPlaying: true,
      };
    }),

  prev: () =>
    set((state) => {
      const { queue, queueIndex, progress } = state;
      if (queue.length === 0) return {};
      if (progress > 3) return { progress: 0 };
      const prevIdx = Math.max(0, queueIndex - 1);
      return {
        currentTrack: queue[prevIdx],
        queueIndex: prevIdx,
        progress: 0,
        isPlaying: true,
      };
    }),

  seek: (progress) => set({ progress }),
  setVolume: (volume) => set({ volume }),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  toggleRepeat: () =>
    set((state) => {
      const modes: RepeatMode[] = ["none", "all", "one"];
      const idx = modes.indexOf(state.repeat);
      return { repeat: modes[(idx + 1) % modes.length] };
    }),
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  addToQueue: (track) =>
    set((state) => ({ queue: [...state.queue, track] })),
  toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
}));
