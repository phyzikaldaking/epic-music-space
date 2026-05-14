"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStudioAudioEngine } from "./studioAudioEngine";

type TransportSnapshot = {
  playing: boolean;
  bar: number;
  startedAt: number;
};

export function useStudioTransportClock({ bpm, initialBar = 1 }: { bpm: number; initialBar?: number }) {
  const [snapshot, setSnapshot] = useState<TransportSnapshot>({ playing: false, bar: initialBar, startedAt: 0 });
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const barRef = useRef(initialBar);
  const rafRef = useRef<number | null>(null);

  const computeBar = useCallback(() => {
    if (!playingRef.current) return barRef.current;
    const engine = getStudioAudioEngine();
    const beatsElapsed = Math.max(0, (engine.now() - startedAtRef.current) * (bpm / 60));
    return Math.max(1, Math.floor(beatsElapsed) + 1);
  }, [bpm]);

  const start = useCallback(() => {
    const engine = getStudioAudioEngine();
    if (engine.context.state === "suspended") void engine.context.resume();
    startedAtRef.current = engine.now();
    playingRef.current = true;
    setSnapshot({ playing: true, bar: barRef.current, startedAt: startedAtRef.current });
  }, []);

  const stop = useCallback(() => {
    barRef.current = computeBar();
    playingRef.current = false;
    setSnapshot({ playing: false, bar: barRef.current, startedAt: startedAtRef.current });
  }, [computeBar]);

  const toggle = useCallback(() => {
    if (playingRef.current) stop();
    else start();
  }, [start, stop]);

  const setBar = useCallback((bar: number) => {
    barRef.current = Math.max(1, bar);
    setSnapshot((current) => ({ ...current, bar: barRef.current }));
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      if (playingRef.current) {
        const nextBar = computeBar();
        if (nextBar !== barRef.current) {
          barRef.current = nextBar;
          setSnapshot({ playing: true, bar: nextBar, startedAt: startedAtRef.current });
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [computeBar]);

  return { ...snapshot, start, stop, toggle, setBar };
}
