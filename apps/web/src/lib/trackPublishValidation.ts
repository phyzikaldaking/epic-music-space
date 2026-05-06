/**
 * Pure submit-eligibility logic for the artist track-upload form.
 *
 * Lives outside the React component so the entire publish decision is
 * unit-testable. The previous "I clicked publish and nothing happens"
 * bugs all came from gating logic baked into the component — too coupled
 * to render to test, too many hidden states to audit. Centralizing the
 * checks here is the structural fix that keeps these regressions from
 * coming back: any new gate has to land in this file, and any new gate
 * has to ship with a test.
 *
 * Rules (in order):
 *   1. audioUrl must be present.
 *   2. audioUrl is trusted unconditionally if it came from our own
 *      upload pipeline (`audioFromOurUpload === true`). For pasted URLs
 *      we run `classifyAudioSource` and reject "unknown".
 *   3. Required text fields must be present (title, artist).
 *   4. Numeric fields parse via `parseDecimal` (locale-tolerant — "9,99"
 *      from EU keyboards becomes 9.99 instead of NaN) and pass server-
 *      mirrored bounds.
 *   5. Optional fields collapse to undefined when missing.
 */

import { classifyAudioSource } from "@/lib/audioSource";

export interface TrackFormState {
  title: string;
  artistName: string;
  genre: string;
  description: string;
  audioUrl: string;
  audioFromOurUpload: boolean;
  coverUrl: string;
  stemUrl: string;
  bpm: string;
  key: string;
  licensePrice: string;
  revenueSharePct: string;
  totalLicenses: string;
  allowFreeDownload: boolean;
  isLegacy: boolean;
  originalReleaseYear: string;
}

export interface TrackPublishPayload {
  title: string;
  artist: string;
  genre?: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  stemUrl?: string;
  hasStems: boolean;
  allowFreeDownload: boolean;
  isLegacy: boolean;
  originalReleaseYear?: number;
  bpm?: number;
  key?: string;
  licensePrice: number;
  revenueSharePct: number;
  totalLicenses: number;
}

export type TrackPublishCheck =
  | { ok: true; payload: TrackPublishPayload }
  | { ok: false; reason: string };

/**
 * Locale-tolerant decimal parser. iOS keyboards in EU locales emit "9,99"
 * for a license price; <input type=number> may surface that differently
 * across browsers, leaving us with NaN that the server rejects. Accept
 * both "." and "," as decimal separators.
 */
export function parseDecimal(value: string): number {
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim().replace(/,/g, ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function validateTrackSubmission(state: TrackFormState): TrackPublishCheck {
  const audioUrl = state.audioUrl.trim();
  if (!audioUrl) {
    return {
      ok: false,
      reason: "Please upload an audio file or provide a direct audio URL.",
    };
  }

  // Trust boundary: an audio URL we minted (via /api/upload + signed PUT)
  // is trusted. Re-classifying an upload publicUrl on submit has caused
  // real "I uploaded, why is publish blocked?" failures whenever the
  // Supabase URL shape drifts. Pasted URLs still get the strict check.
  if (!state.audioFromOurUpload) {
    const classification = classifyAudioSource(audioUrl);
    if (classification.type === "unknown") {
      return {
        ok: false,
        reason:
          "We can't recognize that audio URL. Upload the file directly, or paste a YouTube / Vimeo / SoundCloud / Spotify link.",
      };
    }
  }

  if (!state.title.trim()) {
    return { ok: false, reason: "Add a track title to publish." };
  }
  if (!state.artistName.trim()) {
    return { ok: false, reason: "Add your artist name." };
  }

  const priceNum = parseDecimal(state.licensePrice);
  if (!Number.isFinite(priceNum) || priceNum < 0.5) {
    return { ok: false, reason: "License price must be at least $0.50." };
  }
  const revShareNum = parseDecimal(state.revenueSharePct);
  if (!Number.isFinite(revShareNum) || revShareNum <= 0 || revShareNum > 100) {
    return { ok: false, reason: "Revenue share must be between 0.01% and 100%." };
  }
  const totalLicensesNum = parseDecimal(state.totalLicenses);
  if (!Number.isFinite(totalLicensesNum) || totalLicensesNum < 1) {
    return { ok: false, reason: "Total licenses must be at least 1." };
  }

  const bpmRaw = state.bpm.trim();
  let bpm: number | undefined;
  if (bpmRaw) {
    const parsed = parseDecimal(bpmRaw);
    if (!Number.isFinite(parsed) || parsed < 20 || parsed > 999) {
      return { ok: false, reason: "BPM must be a number between 20 and 999." };
    }
    bpm = Math.round(parsed);
  }

  let originalReleaseYear: number | undefined;
  if (state.isLegacy && state.originalReleaseYear.trim()) {
    const parsed = parseDecimal(state.originalReleaseYear);
    if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= new Date().getFullYear()) {
      originalReleaseYear = Math.round(parsed);
    }
  }

  const stem = state.stemUrl.trim();
  const cover = state.coverUrl.trim();

  return {
    ok: true,
    payload: {
      title: state.title.trim(),
      artist: state.artistName.trim(),
      genre: state.genre.trim() || undefined,
      description: state.description.trim() || undefined,
      audioUrl,
      coverUrl: cover || undefined,
      stemUrl: stem || undefined,
      hasStems: Boolean(stem),
      allowFreeDownload: state.allowFreeDownload,
      isLegacy: state.isLegacy,
      originalReleaseYear,
      bpm,
      key: state.key.trim() || undefined,
      licensePrice: priceNum,
      revenueSharePct: revShareNum,
      totalLicenses: Math.round(totalLicensesNum),
    },
  };
}
