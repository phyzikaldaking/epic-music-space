"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type RafMeterBridge = {
  bindMeter: (trackId: string) => (element: HTMLDivElement | null) => void;
  setMeterValue: (trackId: string, value: number) => void;
  getMeterValue: (trackId: string) => number;
};

export function useRafMeterBridge(trackIds: string[]): RafMeterBridge {
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const valuesRef = useRef(new Map<string, number>());
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    for (const id of trackIds) {
      if (!valuesRef.current.has(id)) valuesRef.current.set(id, 35);
    }
    for (const id of Array.from(valuesRef.current.keys())) {
      if (!trackIds.includes(id)) valuesRef.current.delete(id);
    }
  }, [trackIds]);

  useEffect(() => {
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      elementsRef.current.forEach((element, id) => {
        const value = Math.max(4, Math.min(98, valuesRef.current.get(id) ?? 8));
        element.style.height = `${value}%`;
      });
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const bindMeter = useCallback((trackId: string) => (element: HTMLDivElement | null) => {
    if (element) elementsRef.current.set(trackId, element);
    else elementsRef.current.delete(trackId);
  }, []);

  const setMeterValue = useCallback((trackId: string, value: number) => {
    valuesRef.current.set(trackId, value);
  }, []);

  const getMeterValue = useCallback((trackId: string) => valuesRef.current.get(trackId) ?? 8, []);

  return useMemo(() => ({ bindMeter, setMeterValue, getMeterValue }), [bindMeter, setMeterValue, getMeterValue]);
}
