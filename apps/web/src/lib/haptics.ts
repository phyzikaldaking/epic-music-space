"use client";

import { useEffect, useState } from "react";

// Centralized haptic feedback helper (#C26). Producers can dial the
// intensity (off / soft / strong) from one localStorage setting so a
// quiet evening session doesn't have to fight the device's default
// vibration pattern. Falls back to no-op on browsers without the
// Vibration API (desktop Safari, mostly).

export type HapticIntensity = "off" | "soft" | "strong";

const STORAGE_KEY = "ems.studio.haptics.v1";

function readSetting(): HapticIntensity {
  if (typeof window === "undefined") return "soft";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "off" || v === "soft" || v === "strong") return v;
  } catch {
    // localStorage can throw in private mode — quietly fall back.
  }
  return "soft";
}

function writeSetting(value: HapticIntensity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

/** Trigger a haptic pulse if the user has them enabled. Patterns:
 *  - "tap"     short pulse for taps + step toggles
 *  - "confirm" medium pulse for record / save / publish
 *  - "warn"    triple-pulse for errors / warnings
 *  Scaled per the user's intensity preference. */
export function haptic(kind: "tap" | "confirm" | "warn") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }
  const intensity = readSetting();
  if (intensity === "off") return;
  const scale = intensity === "strong" ? 2 : 1;
  const patterns: Record<typeof kind, number | number[]> = {
    tap: 12 * scale,
    confirm: 30 * scale,
    warn: [25 * scale, 40, 25 * scale],
  };
  try {
    navigator.vibrate(patterns[kind]);
  } catch {
    /* ignore — some browsers throw outside user gestures */
  }
}

/** React hook for the haptic-intensity setting. Returns [value, setter]
 *  and persists to localStorage so the choice survives reloads. */
export function useHapticIntensity(): [
  HapticIntensity,
  (next: HapticIntensity) => void,
] {
  const [value, setValue] = useState<HapticIntensity>("soft");
  useEffect(() => {
    setValue(readSetting());
  }, []);
  function update(next: HapticIntensity) {
    setValue(next);
    writeSetting(next);
  }
  return [value, update];
}
