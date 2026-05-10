"use client";

/**
 * Phone Studio — drastically simplified DAW for viewports < 768px.
 *
 * Why: the full DawWorkspace has a beat grid, mixer strips, sample
 * browser, master chain, plus chrome. On a 6" screen that reads as a
 * wall of buttons and a phone visitor bounces. Most music-curious
 * traffic comes from TikTok/IG which is mobile-dominant. A simpler
 * "tap pads to make a beat" flow is the only thing that will hold a
 * phone visitor's attention long enough to convert.
 *
 * What it does: 4 big drum pads (kick/snare/hat/808), tempo ±, a record
 * button that captures pad taps for 8 bars, and a "Play back" button.
 * "Switch to full studio" link to the desktop DAW for users who want
 * everything.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import { stashGuestMix, GUEST_RESUME_FLAG } from "@/lib/guestStash";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import { useRouter } from "next/navigation";

const MobileBeatGrid = dynamic(() => import("@/components/daw/MobileBeatGrid"), {
  ssr: false,
  loading: () => null,
});

type Pad = {
  kind: DrumKind;
  label: string;
  emoji: string;
  color: string;
};

const PADS: Pad[] = [
  { kind: "kick",   label: "Kick",  emoji: "🥁", color: "from-rose-500/40 to-rose-700/30 border-rose-500/40" },
  { kind: "snare",  label: "Snare", emoji: "💥", color: "from-amber-400/40 to-amber-600/30 border-amber-400/40" },
  { kind: "hat",    label: "Hat",   emoji: "🎩", color: "from-cyan-400/40 to-cyan-600/30 border-cyan-400/40" },
  { kind: "bass808", label: "808",  emoji: "🔊", color: "from-fuchsia-500/40 to-fuchsia-700/30 border-fuchsia-500/40" },
];

const DEFAULT_BPM = 90;
const DEFAULT_KIT: DrumKitId = "trap";
const RECORD_BARS = 8;

interface RecordedHit {
  kind: DrumKind;
  /** Time offset (in seconds) from the start of the recording. */
  offsetSec: number;
}

export default function PhoneStudio() {
  const router = useRouter();
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [recording, setRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [activePad, setActivePad] = useState<DrumKind | null>(null);
  const recordStartRef = useRef<number>(0);
  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const recordTimeoutRef = useRef<number | null>(null);
  const playbackTimeoutsRef = useRef<number[]>([]);
  const [phase, setPhase] = useState<"idle" | "saving" | "sharing">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBeatGrid, setShowBeatGrid] = useState(false);

  function getCtx(): AudioContext {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("No AudioContext");
    // Pro audio defaults: low latency for tap responsiveness, 48 kHz pro rate.
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    masterGainRef.current = gain;
    return ctx;
  }

  function fireHit(kind: DrumKind, velocity = 0.85) {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const dest = masterGainRef.current ?? ctx.destination;
    scheduleDrumHit(ctx, dest, kind, {
      when: ctx.currentTime,
      kit: DEFAULT_KIT,
      velocity: Math.max(0.4, Math.min(1, velocity)),
    });

    if (recording) {
      recordedHitsRef.current.push({
        kind,
        offsetSec: ctx.currentTime - recordStartRef.current,
      });
    }

    setActivePad(kind);
    window.setTimeout(() => setActivePad((cur) => (cur === kind ? null : cur)), 120);

    // Haptic feedback on supporting devices.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate?.(8); }
      catch { /* unsupported */ }
    }
  }

  function startRecording() {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    recordedHitsRef.current = [];
    recordStartRef.current = ctx.currentTime;
    setRecording(true);
    setHasRecording(false);
    const barSec = (60 / bpm) * 4;
    const totalSec = barSec * RECORD_BARS;
    recordTimeoutRef.current = window.setTimeout(() => stopRecording(), totalSec * 1000);
  }

  function stopRecording() {
    if (recordTimeoutRef.current !== null) {
      window.clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
    setRecording(false);
    setHasRecording(recordedHitsRef.current.length > 0);
  }

  function playRecording() {
    if (recordedHitsRef.current.length === 0) return;
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    setPlaying(true);
    const dest = masterGainRef.current ?? ctx.destination;
    const startTime = ctx.currentTime + 0.05;
    let lastEnd = 0;
    for (const hit of recordedHitsRef.current) {
      scheduleDrumHit(ctx, dest, hit.kind, { when: startTime + hit.offsetSec, kit: DEFAULT_KIT });
      lastEnd = Math.max(lastEnd, hit.offsetSec);
    }
    const handle = window.setTimeout(() => setPlaying(false), (lastEnd + 0.6) * 1000);
    playbackTimeoutsRef.current.push(handle);
  }

  function stopPlayback() {
    playbackTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    playbackTimeoutsRef.current = [];
    setPlaying(false);
  }

  /** Render the recorded hits to a WAV blob via OfflineAudioContext.
   *  Used by both the publish-via-signup path and the get-a-share-link
   *  path so the audio bytes match exactly. */
  async function renderRecordingToWav(): Promise<Blob> {
    const lastHit = recordedHitsRef.current.reduce(
      (max, h) => Math.max(max, h.offsetSec),
      0,
    );
    const tailSec = 1.2;
    const totalSec = Math.max(2, lastHit + tailSec);
    const sampleRate = 44_100;
    const offline = new OfflineAudioContext(2, Math.ceil(totalSec * sampleRate), sampleRate);
    const masterGain = offline.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(offline.destination);

    for (const hit of recordedHitsRef.current) {
      scheduleDrumHit(offline, masterGain, hit.kind, {
        when: hit.offsetSec,
        kit: DEFAULT_KIT,
      });
    }
    const rendered = await offline.startRendering();
    return audioBufferToWavBlob(rendered);
  }

  async function publishGuest() {
    if (recordedHitsRef.current.length === 0) return;
    setPhase("saving");
    try {
      const wav = await renderRecordingToWav();
      const fileName = `phone-studio-${Date.now()}.wav`;
      await stashGuestMix(wav, fileName);
      try { window.localStorage.setItem(GUEST_RESUME_FLAG, "1"); } catch { /* private */ }
      void postFunnelEvent({
        event: FUNNEL_EVENTS.guestPublishStash,
        source: "studio_try_phone",
        properties: { sizeBytes: wav.size, hits: recordedHitsRef.current.length },
      });
      router.push("/studio/try/save");
    } catch (err) {
      console.error("[PhoneStudio] publish failed", err);
      setPhase("idle");
      alert(err instanceof Error ? err.message : "Couldn't save your beat. Try again.");
    }
  }

  async function shareGuest() {
    if (recordedHitsRef.current.length === 0) return;
    setPhase("sharing");
    setShareUrl(null);
    try {
      const wav = await renderRecordingToWav();
      const form = new FormData();
      form.append("audio", wav, `phone-studio-${Date.now()}.wav`);
      const res = await fetch("/api/guest-share", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { shareUrl?: string; error?: string };
      if (!res.ok || !data.shareUrl) {
        alert(data.error ?? "Couldn't make a share link. Try again.");
        setPhase("idle");
        return;
      }
      setShareUrl(data.shareUrl);
      setPhase("idle");
      void postFunnelEvent({
        event: FUNNEL_EVENTS.guestShareLinkCreated,
        source: "studio_try_phone",
        properties: { sizeBytes: wav.size, hits: recordedHitsRef.current.length },
      });
      // Try the native share sheet first — it's the smoothest way to
      // get the link into a friend's text on a phone. Falls back to
      // copy-to-clipboard with a "Copied!" pill.
      if (navigator.share) {
        try {
          await navigator.share({
            title: "🎧 Made on EMS Studio",
            text: "Listen to the beat I just made:",
            url: data.shareUrl,
          });
          return;
        } catch { /* user cancelled — fall through to copy */ }
      }
      try {
        await navigator.clipboard.writeText(data.shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2200);
      } catch { /* clipboard blocked — the URL is rendered below */ }
    } catch (err) {
      console.error("[PhoneStudio] share failed", err);
      setPhase("idle");
      alert(err instanceof Error ? err.message : "Couldn't make a share link.");
    }
  }

  useEffect(() => {
    return () => {
      if (recordTimeoutRef.current !== null) window.clearTimeout(recordTimeoutRef.current);
      playbackTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-md flex-col px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <header className="mb-4 text-center">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-amber-300/80">Phone Studio · Tap to play</p>
        <h1 className="mt-1 text-2xl font-extrabold">Make a beat</h1>
        <p className="mt-1 text-xs text-white/55">
          Hit a pad to play. Hit Record, then play your pads. We&apos;ll save what you make.
        </p>
      </header>

      {/* Tempo + transport */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-white/55">BPM</span>
          <button type="button" onClick={() => setBpm((b) => Math.max(60, b - 5))} className="h-7 w-7 rounded-md border border-white/15 bg-white/5 font-bold">−</button>
          <span className="w-8 text-center font-mono font-bold">{bpm}</span>
          <button type="button" onClick={() => setBpm((b) => Math.min(180, b + 5))} className="h-7 w-7 rounded-md border border-white/15 bg-white/5 font-bold">+</button>
        </div>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
            recording ? "bg-red-500 text-white animate-pulse" : "border border-red-500/50 text-red-300"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {recording ? "Recording…" : "Record"}
        </button>
      </div>

      {/* Pads — auto-fit grid: 2x2 on phones, 4x1 on landscape, scales for
          tablets without code changes. clamp() prevents sub-100px tap
          targets on tiny screens and over-large pads on big ones. */}
      <div
        className="grid flex-1 content-start"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(clamp(120px, 40vw, 200px), 1fr))",
          gap: "clamp(8px, 2vw, 16px)",
        }}
      >
        {PADS.map((p) => {
          const active = activePad === p.kind;
          return (
            <button
              key={p.kind}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                // Pointer pressure on supported hardware (Pencil, force-touch
                // trackpads, some Android pens) is 0..1; mouse and most fingers
                // report 0 or 0.5. Default to 0.7 when no usable signal so a
                // missed-pressure tap is still audible.
                const pressure = e.pressure;
                const velocity =
                  pressure > 0 && pressure !== 0.5 ? pressure : 0.7;
                fireHit(p.kind, velocity);
              }}
              className={`relative aspect-square rounded-3xl border bg-gradient-to-br ${p.color} text-center transition active:scale-[0.97] ${active ? "ring-4 ring-white/40" : ""}`}
              aria-label={`Play ${p.label}`}
            >
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span className="text-[clamp(2rem,9cqw,3rem)]">{p.emoji}</span>
                <span className="text-[clamp(0.75rem,2.4cqw,0.95rem)] font-extrabold uppercase tracking-widest text-white">{p.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Beat grid — collapsible 4×8 step sequencer for users who outgrow
          the 4-pad surface but don't want the full desktop DAW. */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowBeatGrid((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-bold uppercase tracking-widest text-white/65 hover:bg-white/10 transition"
        >
          <span>{showBeatGrid ? "Hide beat grid" : "Show beat grid"}</span>
          <span aria-hidden>{showBeatGrid ? "▾" : "▸"}</span>
        </button>
        {showBeatGrid && (
          <div className="mt-2">
            <MobileBeatGrid getCtx={getCtx} bpm={bpm} kit={DEFAULT_KIT} />
          </div>
        )}
      </div>

      {/* Playback + Save + Share */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={playing ? stopPlayback : playRecording}
          disabled={!hasRecording}
          className="rounded-xl border border-white/15 bg-white/5 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          {playing ? "■ Stop" : "▶ Play back"}
        </button>
        <button
          type="button"
          onClick={publishGuest}
          disabled={!hasRecording || phase !== "idle"}
          className="rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-500 py-3 text-sm font-extrabold text-black disabled:opacity-40"
        >
          {phase === "saving" ? "Saving…" : "💾 Save my beat →"}
        </button>
      </div>
      <button
        type="button"
        onClick={shareGuest}
        disabled={!hasRecording || phase !== "idle"}
        className="mt-2 w-full rounded-xl border border-cyan-400/40 bg-cyan-400/10 py-3 text-sm font-bold text-cyan-200 transition disabled:opacity-40"
      >
        {phase === "sharing" ? "Making link…" : "🔗 Get a shareable link (no signup)"}
      </button>
      {shareUrl && (
        <div className="mt-3 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs">
          <p className="text-white/70">
            Your link <span className="text-white/40">(7-day expiry)</span>:
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="block flex-1 truncate rounded bg-black/40 px-2 py-1 text-cyan-200">{shareUrl}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2200);
                } catch { /* */ }
              }}
              className="rounded bg-cyan-500 px-2 py-1 text-[11px] font-bold text-black"
            >
              {copied ? "✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] text-white/45">
        Want the full studio?{" "}
        <Link
          href="/studio/try?force-desktop=1"
          className="font-semibold text-cyan-300 underline decoration-dotted underline-offset-4"
        >
          Open the desktop version
        </Link>
      </p>

      {/* Sticky bottom transport (#6). Always-visible quick access for
          Record / Play-back / BPM / Coach so users on phones can hit the
          essentials no matter how far they've scrolled the pads. */}
      <div
        className="sticky bottom-0 -mx-4 mt-4 flex items-center justify-between gap-2 border-t border-white/10 bg-[#0a0a10]/95 px-4 py-2 backdrop-blur-md"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        }}
      >
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          aria-label={recording ? "Stop recording" : "Record"}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
            recording
              ? "bg-red-500 text-white animate-pulse"
              : "border border-red-500/55 bg-red-500/10 text-red-200"
          }`}
        >
          ●
        </button>
        <button
          type="button"
          onClick={playing ? stopPlayback : playRecording}
          disabled={!hasRecording}
          aria-label={playing ? "Stop playback" : "Play back"}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white disabled:opacity-40"
        >
          {playing ? "■" : "▶"}
        </button>
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => setBpm((b) => Math.max(60, b - 5))}
            aria-label="Decrease BPM by 5"
            className="h-7 w-7 rounded-md border border-white/15 bg-white/5 font-bold"
          >
            −
          </button>
          <span className="w-9 text-center font-mono font-bold text-white">{bpm}</span>
          <span className="text-white/45 uppercase tracking-widest text-[9px]">BPM</span>
          <button
            type="button"
            onClick={() => setBpm((b) => Math.min(180, b + 5))}
            aria-label="Increase BPM by 5"
            className="h-7 w-7 rounded-md border border-white/15 bg-white/5 font-bold"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("studio:open-coach"));
            }
          }}
          aria-label="Open Studio Coach"
          className="flex h-10 items-center gap-1 rounded-full border border-tube-300/40 bg-tube-300/15 px-3 text-[11px] font-black uppercase tracking-widest text-tube-100"
        >
          ✨ Coach
        </button>
      </div>
    </div>
  );
}

/** Minimal AudioBuffer → WAV blob converter. PCM16 stereo, deterministic
 *  header. Lifted from the DAW's renderPatternToBuffer companion path —
 *  same format the rest of the app uses. */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const dataSize = samples * numChannels * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  let off = 0;
  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i)); }
  writeStr("RIFF");
  view.setUint32(off, 36 + dataSize, true); off += 4;
  writeStr("WAVE");
  writeStr("fmt ");
  view.setUint32(off, 16, true); off += 4;
  view.setUint16(off, 1, true); off += 2;          // PCM
  view.setUint16(off, numChannels, true); off += 2;
  view.setUint32(off, sampleRate, true); off += 4;
  view.setUint32(off, sampleRate * numChannels * 2, true); off += 4;
  view.setUint16(off, numChannels * 2, true); off += 2;
  view.setUint16(off, 16, true); off += 2;
  writeStr("data");
  view.setUint32(off, dataSize, true); off += 4;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}
