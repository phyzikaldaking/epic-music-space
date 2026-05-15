"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

export type RafMeterBridge = {
  bindMeter: (trackId: string) => (element: HTMLDivElement | null) => void;
  setMeterValue: (trackId: string, value: number) => void;
  getMeterValue: (trackId: string) => number;
};

function getTargetFrameMs() {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency <= 4) return 42;
  if (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches) return 42;
  return 16;
}

export function useRafMeterBridge(trackIds: string[]): RafMeterBridge {
  const elementsRef = useRef(new Map<string, HTMLDivElement>());
  const valuesRef = useRef(new Map<string, number>());
  const lastPaintedRef = useRef(new Map<string, number>());
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const targetFrameMsRef = useRef(16);

  useEffect(() => {
    targetFrameMsRef.current = getTargetFrameMs();
  }, []);

  useEffect(() => {
    for (const id of trackIds) {
      if (!valuesRef.current.has(id)) valuesRef.current.set(id, 35);
    }
    for (const id of Array.from(valuesRef.current.keys())) {
      if (!trackIds.includes(id)) {
        valuesRef.current.delete(id);
        lastPaintedRef.current.delete(id);
        elementsRef.current.delete(id);
      }
    }
  }, [trackIds]);

  useEffect(() => {
    let mounted = true;
    const tick = (now: number) => {
      if (!mounted) return;
      if (document.visibilityState === "hidden") {
        frameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      if (now - lastFrameAtRef.current >= targetFrameMsRef.current) {
        elementsRef.current.forEach((element, id) => {
          const value = Math.max(4, Math.min(98, valuesRef.current.get(id) ?? 8));
          const last = lastPaintedRef.current.get(id);
          if (last === undefined || Math.abs(last - value) >= 0.75) {
            element.style.transform = `scaleY(${value / 100})`;
            element.style.opacity = `${Math.max(0.32, Math.min(1, value / 85))}`;
            lastPaintedRef.current.set(id, value);
          }
        });
        lastFrameAtRef.current = now;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const bindMeter = useCallback((trackId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      element.style.transformOrigin = "bottom";
      element.style.willChange = "transform, opacity";
      element.style.height = "100%";
      elementsRef.current.set(trackId, element);
    } else {
      elementsRef.current.delete(trackId);
    }
  }, []);

  const setMeterValue = useCallback((trackId: string, value: number) => {
    valuesRef.current.set(trackId, value);
  }, []);

  const getMeterValue = useCallback((trackId: string) => valuesRef.current.get(trackId) ?? 8, []);

  return useMemo(() => ({ bindMeter, setMeterValue, getMeterValue }), [bindMeter, setMeterValue, getMeterValue]);
}