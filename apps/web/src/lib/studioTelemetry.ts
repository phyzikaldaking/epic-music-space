"use client";

import posthog from "posthog-js";

export const STUDIO_EVENTS = [
  "studio_opened","studio_mode_changed","audio_import_started","audio_import_succeeded","audio_import_failed",
  "sample_library_loaded","sample_library_failed","sample_preview_started","sample_preview_failed","sample_assigned",
  "timeline_clip_placed","timeline_clip_played","timeline_clip_failed","beat_pattern_played","beat_pattern_stopped",
  "beat_export_started","beat_export_succeeded","beat_export_failed","print_to_studio_started","print_to_studio_succeeded",
  "print_to_studio_failed","mixer_channel_changed","project_saved","project_restored","project_save_failed",
  "audio_context_resumed","audio_context_failed",
] as const;

export type StudioEvent = typeof STUDIO_EVENTS[number];
type SafeProperties = Record<string, string | number | boolean | null | undefined>;

function safeError(error: unknown) {
  if (error instanceof Error) return { error_name: error.name, error_message: error.message.slice(0, 240), error_stack: error.stack?.split("\\n").slice(0, 5).join("\\n") };
  return { error_name: "UnknownError", error_message: String(error).slice(0, 240) };
}

export function trackStudio(event: StudioEvent, properties: SafeProperties = {}) {
  if (typeof window === "undefined") return;
  posthog.capture(event, {
    surface: "studio",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_RELEASE ?? "local",
    ...properties,
  });
}

export function trackStudioError(event: Extract<StudioEvent, `${string}_failed`>, error: unknown, properties: SafeProperties = {}) {
  trackStudio(event, { ...properties, ...safeError(error) });
}

export function captureStudioException(error: unknown, properties: SafeProperties = {}) {
  if (typeof window === "undefined") return;
  const details = safeError(error);
  posthog.capture("studio_exception", {
    surface: "studio",
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_RELEASE ?? "local",
    ...details,
    ...properties,
  });
}

export function getStudioFlag(flag: string, fallback = false) {
  if (typeof window === "undefined") return fallback;
  try { return posthog.isFeatureEnabled(flag) ?? fallback; } catch { return fallback; }
}

export function optInStudioReplay() {
  if (typeof window === "undefined") return;
  posthog.opt_in_capturing();
  posthog.startSessionRecording();
}

export function optOutStudioReplay() {
  if (typeof window === "undefined") return;
  posthog.stopSessionRecording();
  posthog.opt_out_capturing();
}
