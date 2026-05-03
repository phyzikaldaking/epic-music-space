"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";

export interface PlayerSong {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl?: string | null;
}

interface PlayerState {
  currentSong: PlayerSong | null;
  queue: PlayerSong[];
  history: PlayerSong[];
  isPlaying: boolean;
  progress: number;
  volume: number;
  duration: number;
  currentTime: number;
  isLoading: boolean;
}

type PlayerAction =
  | { type: "PLAY_SONG"; song: PlayerSong }
  | { type: "SET_PLAYING"; value: boolean }
  | { type: "SET_PROGRESS"; progress: number; currentTime: number; duration: number }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "ADD_TO_QUEUE"; song: PlayerSong }
  | { type: "SKIP_NEXT" }
  | { type: "SKIP_PREV" }
  | { type: "SET_LOADING"; value: boolean }
  | { type: "SONG_ENDED" };

function reducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "PLAY_SONG":
      return {
        ...state,
        currentSong: action.song,
        isPlaying: true,
        progress: 0,
        currentTime: 0,
        duration: 0,
        history: state.currentSong
          ? [state.currentSong, ...state.history].slice(0, 20)
          : state.history,
      };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.value };
    case "SET_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        currentTime: action.currentTime,
        duration: action.duration,
      };
    case "SET_VOLUME":
      return { ...state, volume: action.volume };
    case "ADD_TO_QUEUE": {
      const alreadyQueued = state.queue.some((s) => s.id === action.song.id);
      if (alreadyQueued) return state;
      return { ...state, queue: [...state.queue, action.song] };
    }
    case "SKIP_NEXT": {
      const [next, ...rest] = state.queue;
      if (!next) return state;
      return {
        ...state,
        currentSong: next,
        queue: rest,
        isPlaying: true,
        progress: 0,
        currentTime: 0,
        duration: 0,
        history: state.currentSong
          ? [state.currentSong, ...state.history].slice(0, 20)
          : state.history,
      };
    }
    case "SKIP_PREV": {
      const [prev, ...rest] = state.history;
      if (!prev) return state;
      return {
        ...state,
        currentSong: prev,
        history: rest,
        queue: state.currentSong ? [state.currentSong, ...state.queue] : state.queue,
        isPlaying: true,
        progress: 0,
        currentTime: 0,
        duration: 0,
      };
    }
    case "SONG_ENDED": {
      const [next, ...rest] = state.queue;
      if (!next) return { ...state, isPlaying: false, progress: 0, currentTime: 0 };
      return {
        ...state,
        currentSong: next,
        queue: rest,
        isPlaying: true,
        progress: 0,
        currentTime: 0,
        duration: 0,
        history: state.currentSong
          ? [state.currentSong, ...state.history].slice(0, 20)
          : state.history,
      };
    }
    case "SET_LOADING":
      return { ...state, isLoading: action.value };
    default:
      return state;
  }
}

const initialState: PlayerState = {
  currentSong: null,
  queue: [],
  history: [],
  isPlaying: false,
  progress: 0,
  volume: 0.8,
  duration: 0,
  currentTime: 0,
  isLoading: false,
};

interface PlayerContextValue extends PlayerState {
  playSong: (song: PlayerSong) => void;
  togglePlay: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  addToQueue: (song: PlayerSong) => void;
  setVolume: (v: number) => void;
  seekTo: (pct: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Init audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = initialState.volume;

    audio.addEventListener("timeupdate", () => {
      if (audio.duration) {
        dispatch({
          type: "SET_PROGRESS",
          progress: (audio.currentTime / audio.duration) * 100,
          currentTime: audio.currentTime,
          duration: audio.duration,
        });
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      dispatch({
        type: "SET_PROGRESS",
        progress: 0,
        currentTime: 0,
        duration: audio.duration,
      });
    });

    audio.addEventListener("waiting", () => dispatch({ type: "SET_LOADING", value: true }));
    audio.addEventListener("canplay", () => dispatch({ type: "SET_LOADING", value: false }));
    audio.addEventListener("playing", () => {
      dispatch({ type: "SET_LOADING", value: false });
      dispatch({ type: "SET_PLAYING", value: true });
    });
    audio.addEventListener("pause", () => dispatch({ type: "SET_PLAYING", value: false }));
    audio.addEventListener("ended", () => dispatch({ type: "SONG_ENDED" }));
    audio.addEventListener("error", () => {
      dispatch({ type: "SET_LOADING", value: false });
      dispatch({ type: "SET_PLAYING", value: false });
    });

    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // React to currentSong changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;
    audio.src = state.currentSong.audioUrl;
    audio.load();
    if (state.isPlaying) void audio.play().catch(() => {});
  }, [state.currentSong?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to isPlaying toggled externally
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state.currentSong) return;
    if (state.isPlaying) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [state.isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // React to volume changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = state.volume;
  }, [state.volume]);

  const playSong = useCallback((song: PlayerSong) => {
    dispatch({ type: "PLAY_SONG", song });
  }, []);

  const togglePlay = useCallback(() => {
    dispatch({ type: "SET_PLAYING", value: !stateRef.current.isPlaying });
  }, []);

  const skipNext = useCallback(() => dispatch({ type: "SKIP_NEXT" }), []);
  const skipPrev = useCallback(() => dispatch({ type: "SKIP_PREV" }), []);
  const addToQueue = useCallback((song: PlayerSong) => dispatch({ type: "ADD_TO_QUEUE", song }), []);
  const setVolume = useCallback((v: number) => dispatch({ type: "SET_VOLUME", volume: v }), []);

  const seekTo = useCallback((pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const t = (pct / 100) * audio.duration;
    audio.currentTime = t;
    dispatch({
      type: "SET_PROGRESS",
      progress: pct,
      currentTime: t,
      duration: audio.duration,
    });
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        ...state,
        playSong,
        togglePlay,
        skipNext,
        skipPrev,
        addToQueue,
        setVolume,
        seekTo,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
