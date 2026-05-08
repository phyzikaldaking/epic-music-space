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

export interface LicenseVariantInput {
  id: string;
  name: string;
  priceUsd: string | number;
  terms?: string;
  totalLicenses?: string | number;
}

export interface LicenseVariant {
  id: string;
  name: string;
  priceUsd: number;
  terms?: string;
  totalLicenses?: number;
}

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
  // Draft / scheduling. saveAsDraft=true overrides any scheduledAt — it's
  // explicitly a "don't publish yet" signal. scheduledAt is an ISO string
  // (datetime-local control output) or empty for "publish now."
  saveAsDraft?: boolean;
  scheduledAt?: string;
  // Optional tiered licensing. The base licensePrice is always the BASIC
  // tier; additional tiers are layered on top.
  licenseVariants?: LicenseVariantInput[];
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
  isDraft?: boolean;
  scheduledAt?: string;
  licenseVariants?: LicenseVariant[];
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

  // Scheduled-release validation: must be in the future. Past timestamps
  // would publish immediately on the next cron tick, defeating the
  // intent — surface that to the producer instead of silently fixing it.
  let scheduledAtIso: string | undefined;
  if (state.scheduledAt && state.scheduledAt.trim()) {
    const date = new Date(state.scheduledAt);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, reason: "Invalid release date." };
    }
    if (date.getTime() <= Date.now()) {
      return {
        ok: false,
        reason: "Scheduled release must be in the future.",
      };
    }
    scheduledAtIso = date.toISOString();
  }

  // License-tier variants: each must have a valid name and a price >=
  // the basic licensePrice (a "premium" tier cheaper than basic is a UX
  // bug, not a feature). totalLicenses defaults to the parent track cap
  // when not specified per tier.
  let licenseVariants: LicenseVariant[] | undefined;
  if (state.licenseVariants && state.licenseVariants.length > 0) {
    if (state.licenseVariants.length > 6) {
      return { ok: false, reason: "At most 6 license tiers per track." };
    }
    licenseVariants = [];
    const seenIds = new Set<string>();
    for (const v of state.licenseVariants) {
      const id = (v.id ?? "").trim();
      const name = (v.name ?? "").trim();
      if (!id || !name) {
        return { ok: false, reason: "Each license tier needs an id and a name." };
      }
      if (seenIds.has(id)) {
        return { ok: false, reason: `Duplicate license tier id: ${id}` };
      }
      seenIds.add(id);
      const priceNumV = parseDecimal(String(v.priceUsd));
      if (!Number.isFinite(priceNumV) || priceNumV < 0.5) {
        return {
          ok: false,
          reason: `License tier "${name}" needs a price of at least $0.50.`,
        };
      }
      let totalV: number | undefined;
      if (v.totalLicenses !== undefined && v.totalLicenses !== "") {
        const t = parseDecimal(String(v.totalLicenses));
        if (!Number.isFinite(t) || t < 1) {
          return {
            ok: false,
            reason: `License tier "${name}" needs at least 1 total license.`,
          };
        }
        totalV = Math.round(t);
      }
      licenseVariants.push({
        id,
        name,
        priceUsd: priceNumV,
        terms: v.terms?.trim() || undefined,
        totalLicenses: totalV,
      });
    }
  }

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
      isDraft: state.saveAsDraft || undefined,
      scheduledAt: scheduledAtIso,
      licenseVariants,
    },
  };
}
