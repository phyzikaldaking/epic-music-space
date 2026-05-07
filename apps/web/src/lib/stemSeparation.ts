/**
 * Stem separation via Replicate (Demucs).
 *
 * Why Demucs and why Replicate:
 * - Demucs (Meta Research, Apache 2.0) is the strongest open-source
 *   music source separator and routinely beats commercial options.
 * - Replicate runs it on GPU-backed predictions for ~$0.002-$0.01 per
 *   3-min track and exposes a webhook for completion. Letting them
 *   manage the GPU pool keeps our stack focused on Next.js.
 *
 * Flow:
 *   1. Caller (POST /api/songs/[id]/stems/separate) calls startSeparation(audioUrl)
 *   2. Replicate runs the model and POSTs to /api/webhooks/replicate when done
 *   3. handleReplicateWebhook downloads the 4 output URLs, mirrors them into
 *      Supabase (so they live on our CDN, not Replicate's CDN), and updates
 *      the Song row to status=READY with stemFiles populated.
 *
 * Webhook security: Replicate signs payloads. We verify the X-Replicate-Signature
 * header before treating a payload as authoritative.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface StartSeparationResult {
  providerId: string; // Replicate prediction id
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
}

export interface StemUrlMap {
  vocals: string;
  drums: string;
  bass: string;
  other: string;
}

const REPLICATE_API = "https://api.replicate.com/v1";

// Pinned Demucs version (htdemucs_ft fine-tuned 4-source model).
// Update this when Replicate publishes a meaningfully better release.
// https://replicate.com/cjwbw/demucs
const DEMUCS_MODEL_VERSION =
  "25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953";

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) {
    throw new Error(
      "[stemSeparation] REPLICATE_API_TOKEN is not configured. " +
        "Stem separation cannot run without it.",
    );
  }
  return t;
}

/**
 * Kick off a Demucs prediction. Returns immediately with the prediction id;
 * use the webhook (or pollSeparation) to learn when it finishes.
 */
export async function startSeparation(
  audioUrl: string,
  options: { webhookUrl?: string } = {},
): Promise<StartSeparationResult> {
  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: DEMUCS_MODEL_VERSION,
      input: {
        audio: audioUrl,
        // 4-stem output: vocals, drums, bass, other.
        // htdemucs_ft is the fine-tuned variant — slower but cleaner.
        model: "htdemucs_ft",
        // Output as wav so the DAW can load them without re-decoding.
        wav: true,
      },
      ...(options.webhookUrl
        ? { webhook: options.webhookUrl, webhook_events_filter: ["completed"] }
        : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`[stemSeparation] Replicate ${res.status}: ${detail.slice(0, 240)}`);
  }
  const json = (await res.json()) as { id: string; status: StartSeparationResult["status"] };
  return { providerId: json.id, status: json.status };
}

/**
 * Poll a prediction. Used as a fallback when webhooks aren't available
 * (local dev, preview deploys without a public webhook URL).
 */
export async function pollSeparation(
  providerId: string,
): Promise<{
  status: StartSeparationResult["status"];
  output?: StemUrlMap;
  error?: string;
}> {
  const res = await fetch(`${REPLICATE_API}/predictions/${providerId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    throw new Error(`[stemSeparation] Replicate poll ${res.status}`);
  }
  const json = (await res.json()) as {
    status: StartSeparationResult["status"];
    output?: { vocals: string; drums: string; bass: string; other: string } | null;
    error?: string | null;
  };
  return {
    status: json.status,
    output: json.output ?? undefined,
    error: json.error ?? undefined,
  };
}

/**
 * Verify a Replicate webhook signature. Replicate uses HMAC-SHA256
 * over the raw body keyed by the project's signing secret.
 *
 * Header format: `t=<timestamp>,v1=<hmac>`
 */
export function verifyReplicateSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret = process.env.REPLICATE_WEBHOOK_SECRET,
): boolean {
  if (!secret) return false;
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=").map((s) => s.trim())),
  );
  const ts = parts.t;
  const sig = parts.v1;
  if (!ts || !sig) return false;
  const signed = `${ts}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
  } catch {
    return false;
  }
}

/**
 * Mirror Replicate's per-stem URLs into our own Supabase storage so the
 * stems survive past Replicate's CDN retention window (24h) and so the
 * DAW can range-load them via our CDN headers.
 *
 * Returns the public URL map we should persist on the Song row.
 */
export async function mirrorStemsToSupabase(
  songId: string,
  output: StemUrlMap,
  uploader: (kind: keyof StemUrlMap, body: ArrayBuffer) => Promise<string>,
): Promise<StemUrlMap> {
  const kinds: (keyof StemUrlMap)[] = ["vocals", "drums", "bass", "other"];
  const result = {} as StemUrlMap;
  for (const kind of kinds) {
    const url = output[kind];
    if (!url) {
      throw new Error(`[stemSeparation] Replicate output missing '${kind}' for song ${songId}`);
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`[stemSeparation] failed to download '${kind}' (${res.status}) for song ${songId}`);
    }
    const body = await res.arrayBuffer();
    result[kind] = await uploader(kind, body);
  }
  return result;
}
