"use client";

import { useEffect, useRef, useState } from "react";
import { StudioTooltip } from "@/components/ui/StudioTooltip";

interface Props {
  /** Returns the engine's live AudioContext, or null if it hasn't been
   *  initialized yet (no user gesture). The button uses ctx.decodeAudioData
   *  so the resulting AudioBuffer matches the engine's sample rate. */
  getCtx: () => AudioContext | null;
  /** Hand off the captured audio for pitch detection + MIDI write. */
  onCaptured: (buffer: AudioBuffer) => Promise<void>;
}

const RECORD_SECONDS = 8;

/** "Hum a melody" entry point. Captures up to RECORD_SECONDS of mic
 *  input, decodes it into an AudioBuffer at the engine's sample rate,
 *  and hands off to the parent (which calls engine.convertBufferToMidi).
 *  Stops on second click or after the time limit. */
export default function VoiceToMidiButton({ getCtx, onCaptured }: Props) {
  const [phase, setPhase] = useState<"idle" | "recording" | "processing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RECORD_SECONDS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopAndCleanup();
    };
  }, []);

  function stopAndCleanup() {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    streamRef.current = null;
  }

  async function startRecording() {
    if (phase === "recording") {
      // Second click — stop early and let the onstop handler finish.
      stopAndCleanup();
      return;
    }
    setError(null);
    setSecondsLeft(RECORD_SECONDS);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      });
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error
          ? err.message
          : "Microphone access denied or unavailable.",
      );
      return;
    }
    streamRef.current = stream;
    const mr = new MediaRecorder(stream);
    recorderRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      void finalizeRecording();
    };
    mr.start();
    setPhase("recording");
    stopTimerRef.current = window.setTimeout(() => {
      try {
        mr.stop();
      } catch {
        // ignore
      }
    }, RECORD_SECONDS * 1000);
    tickTimerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
  }

  async function finalizeRecording() {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    streamRef.current = null;

    if (chunksRef.current.length === 0) {
      setPhase("idle");
      return;
    }
    setPhase("processing");
    const blob = new Blob(chunksRef.current, {
      type: chunksRef.current[0] instanceof Blob ? (chunksRef.current[0] as Blob).type : "audio/webm",
    });
    const ctx = getCtx();
    if (!ctx) {
      setPhase("error");
      setError("Audio engine not ready — press Play first, then try again.");
      return;
    }
    try {
      const arr = await blob.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arr.slice(0));
      await onCaptured(buffer);
      setPhase("idle");
    } catch (err) {
      setPhase("error");
      setError(
        err instanceof Error ? err.message : "Couldn't decode the recording.",
      );
    }
  }

  const label =
    phase === "recording"
      ? `🎤 Recording… ${secondsLeft}s — tap to stop`
      : phase === "processing"
        ? "🎤 Detecting pitches…"
        : phase === "error"
          ? "🎤 Try again"
          : "🎤 Hum a melody";

  return (
    <div className="flex flex-col gap-1">
      <StudioTooltip label="Hum or sing a melody — we turn it into MIDI notes you can edit on the piano roll.">
        <button
          type="button"
          onClick={startRecording}
          disabled={phase === "processing"}
          className={`rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition ${
            phase === "recording"
              ? "border-rec-500/60 bg-rec-500/20 text-rec-200 animate-pulse"
              : "border-tube-300/35 bg-tube-300/10 text-tube-200 hover:bg-tube-300/20"
          }`}
        >
          {label}
        </button>
      </StudioTooltip>
      {error && (
        <p className="text-[10px] text-rose-300">{error}</p>
      )}
    </div>
  );
}
