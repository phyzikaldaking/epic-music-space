/**
 * AI mastering via Replicate. Uses an open-source mastering model
 * (matchering-style: matches your bounce to a reference target's
 * loudness + spectral balance). Cost: ~$0.01-0.05 per 3-min track.
 *
 * Replicate model: see https://replicate.com/cjwbw/matchering
 *
 * The DAW exports its current mix as WAV, hits /api/mastering/render
 * with the audio URL + an optional reference URL, and the response
 * (when ready) contains the mastered WAV URL ready to be loaded back
 * into the project as a new "Master" track or used as the export.
 */

export interface StartMasteringResult {
  providerId: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
}

const REPLICATE_API = "https://api.replicate.com/v1";

// Pinned matchering version — open-source, no learned model, just
// classic loudness + spectrum matching against a reference. Updates
// here are intentional (regression-test before bumping).
const MATCHERING_VERSION =
  "0e5d86b00c7ecde0c2a3cd61bbac68ed7a43b01a1f33b7e4b8e3e2c7c41e40f5";

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) {
    throw new Error(
      "[aiMastering] REPLICATE_API_TOKEN is not configured. AI mastering is unavailable.",
    );
  }
  return t;
}

/**
 * Kick off a matchering prediction. The reference defaults to a
 * curated "modern hip-hop / pop" master so artists get a useful
 * result with no extra setup.
 */
export async function startMastering(
  audioUrl: string,
  options: {
    referenceUrl?: string;
    webhookUrl?: string;
    /** Output target loudness (LUFS). Defaults to -14 LUFS for streaming. */
    targetLufs?: number;
  } = {},
): Promise<StartMasteringResult> {
  const referenceUrl =
    options.referenceUrl ?? process.env.MASTERING_DEFAULT_REFERENCE_URL;
  if (!referenceUrl) {
    throw new Error(
      "[aiMastering] No reference track provided and MASTERING_DEFAULT_REFERENCE_URL is unset.",
    );
  }

  const res = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: MATCHERING_VERSION,
      input: {
        target: audioUrl,
        reference: referenceUrl,
        target_loudness: options.targetLufs ?? -14,
      },
      ...(options.webhookUrl
        ? { webhook: options.webhookUrl, webhook_events_filter: ["completed"] }
        : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`[aiMastering] Replicate ${res.status}: ${detail.slice(0, 240)}`);
  }
  const json = (await res.json()) as { id: string; status: StartMasteringResult["status"] };
  return { providerId: json.id, status: json.status };
}

export async function pollMastering(
  providerId: string,
): Promise<{
  status: StartMasteringResult["status"];
  output?: string;
  error?: string;
}> {
  const res = await fetch(`${REPLICATE_API}/predictions/${providerId}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  if (!res.ok) {
    throw new Error(`[aiMastering] Replicate poll ${res.status}`);
  }
  const json = (await res.json()) as {
    status: StartMasteringResult["status"];
    output?: string | null;
    error?: string | null;
  };
  return {
    status: json.status,
    output: json.output ?? undefined,
    error: json.error ?? undefined,
  };
}
