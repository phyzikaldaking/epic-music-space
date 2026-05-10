"use client";

import { useState } from "react";
import { getStudioContext } from "@/lib/studioContextStore";

interface Props {
  spectrum: number[];
  lufs: number;
  truePeak: number;
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
export default function MixDiagnosticsCallout({ spectrum, lufs, truePeak }: Props) {
  const [diagnosis, setDiagnosis] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
