"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "requesting" | "running" | "done" | "error";

interface Result {
  rmsAvg: number;
  peakDb: number;
  silent: boolean;
  clipping: boolean;
  feedbackRisk: boolean;
  /** Verdict: PASS / WARNING / FAIL */
  verdict: "pass" | "warn" | "fail";
  notes: string[];
}

const TEST_DURATION_SEC = 3;

export default function MicTestClient() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [liveLevel, setLiveLevel] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  async function runTest() {
    setError(null);
    setResult(null);
    setProgress(0);
    setLiveLevel(0);
    setPhase("requesting");

    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (err) {
      setPhase("error");
      const msg = err instanceof Error ? err.message : "Microphone access denied.";
      setError(`${msg} — check your browser site permissions, then try again.`);
      return;
    }

    setPhase("running");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);

      // Analyser for both peak/RMS measurement and feedback detection.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);

      const timeBuf = new Float32Array(analyser.fftSize);
      const freqBuf = new Float32Array(analyser.frequencyBinCount);

      let peak = 0;
      let rmsSum = 0;
      let rmsCount = 0;
      let feedbackHits = 0;
      let totalFrames = 0;

      const startedAt = performance.now();
      const endsAt = startedAt + TEST_DURATION_SEC * 1000;

      const tick = () => {
        if (!ctx || ctx.state !== "running") return;
        const now = performance.now();
        if (now >= endsAt) return;

        analyser.getFloatTimeDomainData(timeBuf);
        analyser.getFloatFrequencyData(freqBuf);

        // Peak + RMS this frame
        let framePeak = 0;
        let frameSqSum = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i] ?? 0;
          const a = Math.abs(v);
          if (a > framePeak) framePeak = a;
          frameSqSum += v * v;
        }
        const frameRms = Math.sqrt(frameSqSum / timeBuf.length);
        if (framePeak > peak) peak = framePeak;
        rmsSum += frameRms;
        rmsCount++;
        totalFrames++;

        setLiveLevel(framePeak);
        setProgress(Math.min(1, (now - startedAt) / (TEST_DURATION_SEC * 1000)));

        // Feedback heuristic: feedback typically presents as a single
        // dominant narrow spectral peak that's much louder than the
        // surrounding bins. We look for a bin where dB > -20 AND
        // exceeds neighbors by > 12 dB. Won't catch every feedback case,
        // but catches the classic howl before it starts being painful.
        let dominantIdx = -1;
        let dominantDb = -Infinity;
        for (let i = 4; i < freqBuf.length; i++) {
          const v = freqBuf[i] ?? -Infinity;
          if (v > dominantDb) {
            dominantDb = v;
            dominantIdx = i;
          }
        }
        if (dominantIdx > 4 && dominantIdx < freqBuf.length - 4) {
          const left = freqBuf[dominantIdx - 4] ?? -Infinity;
          const right = freqBuf[dominantIdx + 4] ?? -Infinity;
          const neighborMax = Math.max(left, right);
          if (dominantDb > -20 && dominantDb - neighborMax > 12) {
            feedbackHits++;
          }
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);

      // Wait for test to complete
      await new Promise<void>((resolve) => {
        const id = window.setTimeout(resolve, TEST_DURATION_SEC * 1000 + 100);
        cleanupRef.current = () => window.clearTimeout(id);
      });

      const rmsAvg = rmsCount > 0 ? rmsSum / rmsCount : 0;
      const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
      const silent = peak < 0.005; // -46 dB-ish
      const clipping = peak > 0.95;
      // Flag feedback only if a meaningful fraction of frames showed the pattern.
      const feedbackRisk = totalFrames > 0 && feedbackHits / totalFrames > 0.35;

      const notes: string[] = [];
      if (silent) {
        notes.push(
          "We didn't hear anything. Confirm the right input device is selected in your browser/OS, that the mic isn't muted, and that nothing physical is blocking it. Try saying \"check\" loudly and re-run.",
        );
      } else if (clipping) {
        notes.push(
          `Peak hit ${peakDb.toFixed(1)} dB — that's too hot and will distort. Lower your input gain in your OS sound settings or back off the mic.`,
        );
      } else if (peak < 0.05) {
        notes.push(
          `Peak only ${peakDb.toFixed(1)} dB — usable but quiet. You'll have to push gain in the studio. Speak closer to the mic for a cleaner take.`,
        );
      } else {
        notes.push(`Peak ${peakDb.toFixed(1)} dB — healthy headroom for tracking.`);
      }
      if (feedbackRisk) {
        notes.push(
          "We detected a tight spectral peak that looks like feedback (mic picking up your speakers). Use headphones or move the mic away from the speakers before recording.",
        );
      }

      let verdict: Result["verdict"];
      if (silent) verdict = "fail";
      else if (clipping || feedbackRisk) verdict = "warn";
      else verdict = "pass";

      setResult({ rmsAvg, peakDb, silent, clipping, feedbackRisk, verdict, notes });
      setProgress(1);
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      if (ctx) await ctx.close();
    }
  }

  const verdictTone =
    result?.verdict === "pass"
      ? { border: "border-emerald-400/40", bg: "bg-emerald-400/10", text: "text-emerald-100", title: "Pass — ready to record" }
      : result?.verdict === "warn"
        ? { border: "border-amber-400/40", bg: "bg-amber-400/10", text: "text-amber-100", title: "Warning — fix before recording" }
        : { border: "border-rose-400/40", bg: "bg-rose-400/10", text: "text-rose-100", title: "Fail — no audio detected" };

  const liveDb = liveLevel > 0 ? 20 * Math.log10(liveLevel) : -Infinity;
  const liveBarPct = Math.max(0, Math.min(100, ((liveDb + 60) / 60) * 100));

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/45">
              Loopback test
            </p>
            <p className="text-sm text-white/85">
              {phase === "idle" && "Press start, then talk into your mic for 3 seconds."}
              {phase === "requesting" && "Waiting for browser permission…"}
              {phase === "running" && "Listening — keep talking…"}
              {phase === "done" && "Done."}
              {phase === "error" && "Couldn't run the test."}
            </p>
          </div>
          <button
            type="button"
            onClick={runTest}
            disabled={phase === "requesting" || phase === "running"}
            className="rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50 transition"
          >
            {phase === "running"
              ? `Listening… ${Math.round(progress * TEST_DURATION_SEC)}s / ${TEST_DURATION_SEC}s`
              : phase === "requesting"
                ? "Waiting…"
                : phase === "done"
                  ? "Run again"
                  : "Start mic test"}
          </button>
        </div>

        {(phase === "running" || phase === "done") && (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/45">
                <span>Input level</span>
                <span className="font-mono">
                  {Number.isFinite(liveDb) ? `${liveDb.toFixed(1)} dB` : "—"}
                </span>
              </p>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 via-amber-300 to-rose-400 transition-[width] duration-75"
                  style={{ width: `${liveBarPct}%` }}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/45">
                Test progress
              </p>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-cyan-400/70 transition-[width] duration-100"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {result && (
        <div className={`rounded-2xl border ${verdictTone.border} ${verdictTone.bg} ${verdictTone.text} p-4`}>
          <p className="text-xs font-black uppercase tracking-widest">{verdictTone.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
            <ResultStat label="Peak" value={Number.isFinite(result.peakDb) ? `${result.peakDb.toFixed(1)} dB` : "—"} />
            <ResultStat label="RMS avg" value={result.rmsAvg > 0 ? `${(20 * Math.log10(result.rmsAvg)).toFixed(1)} dB` : "—"} />
            <ResultStat label="Feedback risk" value={result.feedbackRisk ? "Detected" : "Clear"} />
          </div>
        </div>
      )}
    </section>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/45">{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}
