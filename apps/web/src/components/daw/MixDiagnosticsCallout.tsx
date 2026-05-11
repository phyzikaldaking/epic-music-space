"use client";

import { useMemo, useState } from "react";
import { getStudioContext } from "@/lib/studioContextStore";

// Proactive mix coach (#23 in the 30-item audit). The free-text "Check
// my mix" button below is reactive; this surfaces specific issues +
// one-click fixes at all times so producers don't have to ask. Each
// rule reads the current spectrum + LUFS + true peak, decides whether
// it has a strong recommendation, and emits a payload the parent can
// dispatch as a studio:execute-tool event for one-click apply.
interface ProactiveRule {
  id: string;
  /** Short headline. */
  title: string;
  /** One-line plain-English explanation. */
  why: string;
  /** Action button label. */
  applyLabel: string;
  /** The studio:execute-tool payload — same shape the AI coach uses. */
  toolCall: {
    name: string;
    args: Record<string, unknown>;
  };
}

// Per-genre threshold + tone adjustments. Trap is *expected* to be
// sub-heavy so we relax the "mids are buried" rule; jazz is supposed
// to be wide and dynamic so we'd flag a hot limiter even when stream
// targets are fine. The defaults below apply when no genre is set.
const GENRE_RULES: Record<
  string,
  {
    // The "bass too heavy" rule threshold — trap mixes can run much
    // hotter on the low end before it counts as a problem.
    bassDominanceLimit: number;
    // The "harsh highs" sensitivity. Pop wants brighter highs than
    // hip-hop, so we relax this rule for pop.
    highHeat: number;
    // Per-genre note appended to bass/high suggestions.
    bassHint?: string;
    highHint?: string;
  }
> = {
  trap: { bassDominanceLimit: 1.8, highHeat: 0.7, bassHint: "Trap loves sub — but check mono compatibility before pushing further." },
  drill: { bassDominanceLimit: 1.7, highHeat: 0.7 },
  "hip-hop": { bassDominanceLimit: 1.5, highHeat: 0.7 },
  "r&b": { bassDominanceLimit: 1.2, highHeat: 0.55, highHint: "R&B vocals live in the air band — be gentle here." },
  pop: { bassDominanceLimit: 1.2, highHeat: 0.8 },
  rock: { bassDominanceLimit: 1.3, highHeat: 0.75 },
  jazz: { bassDominanceLimit: 1.1, highHeat: 0.65, bassHint: "Jazz wants the bass natural — don't over-compress it." },
  "lo-fi": { bassDominanceLimit: 1.6, highHeat: 0.55 },
  electronic: { bassDominanceLimit: 1.7, highHeat: 0.75 },
};

function computeProactiveSuggestions(
  bands: Band[],
  lufs: number,
  truePeak: number,
  genre: string | null,
): ProactiveRule[] {
  const out: ProactiveRule[] = [];
  const rule = (genre && GENRE_RULES[genre.toLowerCase()]) || {
    bassDominanceLimit: 1.3,
    highHeat: 0.7,
    bassHint: undefined,
    highHint: undefined,
  };
  // Rule 1: master too quiet (LUFS < -22) → suggest streaming preset.
  if (Number.isFinite(lufs) && lufs < -22) {
    out.push({
      id: "loud-streaming",
      title: "Mix is quiet for streaming",
      why: `Master reads ${lufs.toFixed(1)} LUFS — Spotify / Apple normalize to about -14. Push it.`,
      applyLabel: "Apply streaming master",
      toolCall: { name: "applyMasteringPreset", args: { preset: "streamReady" } },
    });
  }
  // Genre-specific over-loud guardrail. Jazz / classical mastering
  // wants the dynamics intact — flag if LUFS climbs above -10.
  if ((genre === "jazz" || genre === "classical") && lufs > -10) {
    out.push({
      id: "preserve-dynamics",
      title: "Mix is too compressed for this genre",
      why: `${lufs.toFixed(1)} LUFS is broadcast-loud — jazz / classical streaming targets ~-16 LUFS to preserve breath.`,
      applyLabel: "Pull master back -3 dB",
      toolCall: { name: "setMasterGain", args: { db: -3 } },
    });
  }
  // Rule 2: clipping risk (true peak > -1 dBTP) → enable limiter.
  if (truePeak > 0) {
    const truePeakDb = 20 * Math.log10(Math.max(0.0001, truePeak));
    if (truePeakDb > -1) {
      out.push({
        id: "limit-peaks",
        title: "True peak nearing 0 dBTP",
        why: `Hitting ${truePeakDb.toFixed(1)} dBTP — flip the limiter on to keep streaming codecs happy.`,
        applyLabel: "Turn on limiter",
        toolCall: { name: "setLimiter", args: { on: true } },
      });
    }
  }
  // Rule 3: bass-heavy mix (sub-bass + bass >> mid). Threshold scales
  // with the genre rule above.
  const subBass = bands.find((b) => b.label === "Sub-bass")?.energy ?? 0;
  const bass = bands.find((b) => b.label === "Bass")?.energy ?? 0;
  const mid = bands.find((b) => b.label === "Mid")?.energy ?? 0;
  if (subBass + bass > rule.bassDominanceLimit && mid < 0.4) {
    out.push({
      id: "tame-bass",
      title: "Bass is masking the mids",
      why: `Sub + bass energy is dominating; the mid range (vocals, snare body) gets buried. Cut the master low.${rule.bassHint ? ` ${rule.bassHint}` : ""}`,
      applyLabel: "Cut master low -3 dB",
      toolCall: { name: "setMasterEq", args: { band: "low", db: -3 } },
    });
  }
  // Rule 4: harsh top end. Sensitivity adjusted per genre.
  const highMid = bands.find((b) => b.label === "High-mid")?.energy ?? 0;
  const air = bands.find((b) => b.label === "Air")?.energy ?? 0;
  if (highMid > rule.highHeat && air > rule.highHeat - 0.1) {
    out.push({
      id: "tame-highs",
      title: "Top end is harsh",
      why: `High-mid and air are both hot — fatigues ears on long listens.${rule.highHint ? ` ${rule.highHint}` : " Pull the master high down."}`,
      applyLabel: "Cut master high -2 dB",
      toolCall: { name: "setMasterEq", args: { band: "high", db: -2 } },
    });
  }
  return out;
}

interface Props {
  spectrum: number[];
  lufs: number;
  truePeak: number;
  /** Optional project genre. Tunes the rule thresholds — see
   *  GENRE_RULES above. Null → generic defaults. */
  projectGenre?: string | null;
}

interface Band {
  label: string;
  rangeHz: string;
  /** Average bin energy 0..1. */
  energy: number;
}

/** Bin index ranges for a 32-bin log-scale spectrum running 20 Hz..20 kHz.
 *  These are approximate cuts that line up with the spectrum analyser the
 *  master panel already renders, so users can correlate what they see with
 *  what the AI says. */
function summarizeBands(spectrum: number[]): Band[] {
  if (spectrum.length === 0) return [];
  const n = spectrum.length;
  const cuts = [
    { label: "Sub-bass", rangeHz: "<60Hz", from: 0, to: Math.floor(n * 0.08) },
    { label: "Bass", rangeHz: "60–250Hz", from: Math.floor(n * 0.08), to: Math.floor(n * 0.22) },
    { label: "Low-mid", rangeHz: "250–500Hz", from: Math.floor(n * 0.22), to: Math.floor(n * 0.35) },
    { label: "Mid", rangeHz: "500Hz–2kHz", from: Math.floor(n * 0.35), to: Math.floor(n * 0.6) },
    { label: "High-mid", rangeHz: "2k–6kHz", from: Math.floor(n * 0.6), to: Math.floor(n * 0.82) },
    { label: "Air", rangeHz: ">6kHz", from: Math.floor(n * 0.82), to: n },
  ];
  return cuts.map((c) => {
    let sum = 0;
    let count = 0;
    for (let i = c.from; i < c.to; i++) {
      sum += spectrum[i] ?? 0;
      count++;
    }
    return {
      label: c.label,
      rangeHz: c.rangeHz,
      energy: count > 0 ? sum / count : 0,
    };
  });
}

/** "Check my mix" — sends LUFS, true-peak, and per-band energy to the AI
 *  Coach via the streaming endpoint, renders the diagnosis live. */
export default function MixDiagnosticsCallout({ spectrum, lufs, truePeak, projectGenre }: Props) {
  const [diagnosis, setDiagnosis] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissedRuleIds, setDismissedRuleIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Recompute proactive suggestions whenever the spectrum / LUFS / peak
  // changes. Memoised on the inputs so the callout doesn't thrash on
  // every render — only when actual measurements shift do we
  // re-evaluate the rules. Genre tunes the rule thresholds — trap can
  // run hotter on the low end before it's "too bassy", jazz wants
  // dynamics preserved, etc.
  const proactiveSuggestions = useMemo(() => {
    const bands = summarizeBands(spectrum);
    return computeProactiveSuggestions(bands, lufs, truePeak, projectGenre ?? null).filter(
      (r) => !dismissedRuleIds.has(r.id),
    );
  }, [spectrum, lufs, truePeak, projectGenre, dismissedRuleIds]);

  function applyToolCall(toolCall: ProactiveRule["toolCall"]) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("studio:execute-tool", { detail: toolCall }),
    );
  }

  async function checkMyMix() {
    if (streaming) return;
    setError(null);
    setDiagnosis("");
    setStreaming(true);
    try {
      const bands = summarizeBands(spectrum);
      const truePeakDb =
        truePeak > 0 ? 20 * Math.log10(Math.max(0.0001, truePeak)) : -Infinity;
      const lufsStr = Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS` : "no LUFS reading yet";
      const tpStr = Number.isFinite(truePeakDb) ? `${truePeakDb.toFixed(1)} dBTP` : "−∞ dBTP";
      const bandStr = bands.length > 0
        ? bands
            .map((b) => `${b.label} ${b.rangeHz}: ${(b.energy * 100).toFixed(0)}%`)
            .join(", ")
        : "spectrum unavailable";
      const userPrompt =
        `Quick mix check. Master reads ${lufsStr}, true peak ${tpStr}. ` +
        `Energy distribution: ${bandStr}. ` +
        `Give me 3 specific things to change, in priority order. Keep it short.`;
      const studioContext = getStudioContext();
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userPrompt }],
          studioContext: studioContext.route ? studioContext : undefined,
        }),
      });

      if (res.status === 401) {
        setError("Sign in to use the Coach.");
        return;
      }
      if (res.status === 429) {
        setError("Slow down — try again in a minute.");
        return;
      }
      if (!res.ok || !res.body) {
        setError("The Coach didn't respond. Try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const payload = dataLine.slice(5).trim();
          if (payload === "[DONE]") {
            buffer = "";
            break;
          }
          try {
            const parsed = JSON.parse(payload) as
              | { delta: string }
              | { error: string };
            if ("delta" in parsed && parsed.delta) {
              setDiagnosis((prev) => prev + parsed.delta);
            } else if ("error" in parsed) {
              setError(parsed.error);
            }
          } catch {
            // ignore malformed event
          }
        }
      }
    } catch {
      setError("Network error.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-tube-300/30 bg-gradient-to-br from-tube-300/10 via-amber-500/5 to-rose-500/5 p-3">
      {proactiveSuggestions.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {proactiveSuggestions.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/[0.08] p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-200">
                  {rule.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/75">
                  {rule.why}
                </p>
              </div>
              <button
                type="button"
                onClick={() => applyToolCall(rule.toolCall)}
                className="rounded-md border border-amber-300/50 bg-amber-400/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-100 transition hover:bg-amber-400/30"
              >
                {rule.applyLabel}
              </button>
              <button
                type="button"
                onClick={() =>
                  setDismissedRuleIds((s) => {
                    const next = new Set(s);
                    next.add(rule.id);
                    return next;
                  })
                }
                className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white/45 hover:bg-white/10"
                aria-label={`Dismiss "${rule.title}" suggestion`}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.32em] text-tube-300">
            Studio Coach
          </p>
          <p className="mt-0.5 text-xs text-white/65">
            Get a 3-bullet diagnosis of the current mix.
          </p>
        </div>
        <button
          type="button"
          onClick={checkMyMix}
          disabled={streaming}
          className="rounded-md border border-tube-300/45 bg-tube-300/15 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-tube-100 transition hover:bg-tube-300/25 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {streaming ? "Coach is listening…" : "Check my mix"}
        </button>
      </div>

      {(diagnosis || streaming || error) && (
        <div className="mt-3 rounded-md border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-white/85">
          {error ? (
            <p className="text-rose-300">{error}</p>
          ) : (
            <p className="whitespace-pre-wrap">
              {diagnosis || (streaming ? "Listening to your mix…" : "")}
              {streaming && (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-3.5 w-1.5 -mb-0.5 animate-pulse bg-tube-300/80"
                />
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
