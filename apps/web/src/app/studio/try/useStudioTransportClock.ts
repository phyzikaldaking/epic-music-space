"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStudioAudioEngine } from "./studioAudioEngine";

type TransportSnapshot = {
  playing: boolean;
  bar: number;
  beat: number;
  positionSec: number;
  startedAt: number;
};

export function useStudioTransportClock({ bpm, initialBar = 1 }: { bpm: number; initialBar?: number }) {
  const secondsPerBeat = 60 / bpm;
  const initialPosition = Math.max(0, (initialBar - 1) * secondsPerBeat);
  const [snapshot, setSnapshot] = useState<TransportSnapshot>({ playing: false, bar: initialBar, beat: 1, positionSec: initialPosition, startedAt: 0 });
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const positionAtStartRef = useRef(initialPosition);
  const positionSecRef = useRef(initialPosition);
  const rafRef = useRef<number | null>(null);

  const computePositionSec = useCallback(() => {
    if (!playingRef.current) return positionSecRef.current;
    const engine = getStudioAudioEngine();
    return Math.max(0, positionAtStartRef.current + engine.now() - startedAtRef.current);
  }, []);

  const makeSnapshot = useCallback((playing: boolean): TransportSnapshot => {
    const positionSec = computePositionSec();
    const absoluteBeat = Math.max(0, positionSec / Math.max(secondsPerBeat, 0.001));
    const bar = Math.max(1, Math.floor(absoluteBeat / 4) + 1);
    const beat = Math.max(1, Math.floor(absoluteBeat % 4) + 1);
    positionSecRef.current = positionSec;
    return { playing, bar, beat, positionSec, startedAt: startedAtRef.current };
  }, [computePositionSec, secondsPerBeat]);

  const start = useCallback(() => {
    const engine = getStudioAudioEngine();
    if (engine.context.state === "suspended") void engine.context.resume();
    positionAtStartRef.current = positionSecRef.current;
    startedAtRef.current = engine.now();
    playingRef.current = true;
    setSnapshot(makeSnapshot(true));
  }, [makeSnapshot]);

  const stop = useCallback(() => {
    const next = makeSnapshot(false);
    playingRef.current = false;
    positionSecRef.current = next.positionSec;
    positionAtStartRef.current = next.positionSec;
    setSnapshot({ ...next, playing: false });
  }, [makeSnapshot]);

  const reset = useCallback(() => {
    playingRef.current = false;
    startedAtRef.current = 0;
    positionAtStartRef.current = 0;
    positionSecRef.current = 0;
    setSnapshot({ playing: false, bar: 1, beat: 1, positionSec: 0, startedAt: 0 });
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) stop();
    else start();
  }, [start, stop]);

  const setBar = useCallback((bar: number) => {
    const safeBar = Math.max(1, bar);
    const nextPosition = (safeBar - 1) * 4 * secondsPerBeat;
    positionSecRef.current = nextPosition;
    positionAtStartRef.current = nextPosition;
    if (playingRef.current) startedAtRef.current = getStudioAudioEngine().now();
    setSnapshot(makeSnapshot(playingRef.current));
  }, [makeSnapshot, secondsPerBeat]);

  const seekSec = useCallback((positionSec: number) => {
    const nextPosition = Math.max(0, positionSec);
    positionSecRef.current = nextPosition;
    positionAtStartRef.current = nextPosition;
    if (playingRef.current) startedAtRef.current = getStudioAudioEngine().now();
    setSnapshot(makeSnapshot(playingRef.current));
  }, [makeSnapshot]);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      if (playingRef.current) setSnapshot(makeSnapshot(true));
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, [makeSnapshot]);

  return { ...snapshot, start, stop, reset, toggle, setBar, seekSec };
}
