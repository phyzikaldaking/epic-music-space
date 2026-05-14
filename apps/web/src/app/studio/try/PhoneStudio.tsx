"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import StudioVideoCollab from "@/components/daw/StudioVideoCollab";
import { haptic, useHapticIntensity } from "@/lib/haptics";
import { stashGuestMix, GUEST_RESUME_FLAG } from "@/lib/guestStash";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

const MobileBeatGrid = dynamic(() => import("@/components/daw/MobileBeatGrid"), { ssr: false, loading: () => null });

type Pad = { kind: DrumKind; label: string; keyHint: string };
type StudioMode = "edit" | "mix" | "beat" | "collab" | "export";

const PADS: Pad[] = [
  { kind: "kick", label: "Kick", keyHint: "1" },
  { kind: "snare", label: "Snare", keyHint: "2" },
  { kind: "hat", label: "Hat", keyHint: "3" },
  { kind: "bass808", label: "808", keyHint: "4" },
];

const MODES: { id: StudioMode; label: string; sub: string }[] = [
  { id: "edit", label: "Edit", sub: "timeline" },
  { id: "mix", label: "Mix", sub: "levels" },
  { id: "beat", label: "Beat", sub: "pads" },
  { id: "collab", label: "Collab", sub: "room" },
  { id: "export", label: "Export", sub: "share" },
];

const DEFAULT_BPM = 90;
const DEFAULT_KIT: DrumKitId = "trap";
const RECORD_BARS = 8;
interface RecordedHit { kind: DrumKind; offsetSec: number }

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

export default function PhoneStudio() {
  const [hapticIntensity, setHapticIntensity] = useHapticIntensity();
  const router = useRouter();
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [mode, setMode] = useState<StudioMode>("beat");
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [recording, setRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [activePad, setActivePad] = useState<DrumKind | null>(null);
  const recordStartRef = useRef<number>(0);
  const recordedHitsRef = useRef<RecordedHit[]>([]);
  const recordTimeoutRef = useRef<number | null>(null);
  const playbackTimeoutsRef = useRef<number[]>([]);
  const [phase, setPhase] = useState<"idle" | "saving" | "sharing">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const playingRef = useRef(false);
  const hasRecordingRef = useRef(false);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { hasRecordingRef.current = hasRecording; }, [hasRecording]);

  function getCtx(): AudioContext {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("No AudioContext");
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
    scheduleDrumHit(ctx, dest, kind, { when: ctx.currentTime, kit: DEFAULT_KIT, velocity: Math.max(0.4, Math.min(1, velocity)) });
    haptic("tap");
    if (recording) recordedHitsRef.current.push({ kind, offsetSec: ctx.currentTime - recordStartRef.current });
    setActivePad(kind);
    window.setTimeout(() => setActivePad((cur) => (cur === kind ? null : cur)), 120);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { (navigator as Navigator & { vibrate?: (n: number) => boolean }).vibrate?.(8); } catch {}
    }
  }

  function startRecording() {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    recordedHitsRef.current = [];
    recordStartRef.current = ctx.currentTime;
    setRecording(true);
    setHasRecording(false);
    setNotice("Recording. Play the pads.");
    const barSec = (60 / bpm) * 4;
    recordTimeoutRef.current = window.setTimeout(() => stopRecording(), barSec * RECORD_BARS * 1000);
  }

  function stopRecording() {
    if (recordTimeoutRef.current !== null) window.clearTimeout(recordTimeoutRef.current);
    recordTimeoutRef.current = null;
    setRecording(false);
    setHasRecording(recordedHitsRef.current.length > 0);
    setNotice(recordedHitsRef.current.length > 0 ? "Take captured." : "No hits recorded yet.");
  }

  function handoffToDesktop() {
    const hits = recordedHitsRef.current;
    if (hits.length === 0) { setNotice("Record at least one hit first."); return; }
    const stepSec = 60 / bpm / 4;
    const lanes: DrumKind[] = ["kick", "snare", "clap", "hat", "openHat", "perc", "bass808", "crash"];
    const pattern: Record<string, boolean[]> = {};
    for (const lane of lanes) pattern[lane] = new Array(16).fill(false);
    for (const hit of hits) {
      const step = Math.round(hit.offsetSec / stepSec) % 16;
      if (step >= 0 && step < 16) pattern[hit.kind]![step] = true;
    }
    try {
      window.localStorage.setItem("ems.phone.handoff.v1", JSON.stringify({ bpm, kit: DEFAULT_KIT, pattern, savedAt: new Date().toISOString() }));
      setNotice("Pattern saved for desktop Studio.");
      haptic("confirm");
    } catch { setNotice("Couldn't save the handoff. Try saving as audio instead."); }
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
    playbackTimeoutsRef.current.push(window.setTimeout(() => setPlaying(false), (lastEnd + 0.6) * 1000));
  }

  function stopPlayback() {
    playbackTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    playbackTimeoutsRef.current = [];
    setPlaying(false);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (playingRef.current) stopPlayback();
        else if (hasRecordingRef.current) playRecording();
      }
      const pad = e.key === "1" ? "kick" : e.key === "2" ? "snare" : e.key === "3" ? "hat" : e.key === "4" ? "bass808" : null;
      if (pad) fireHit(pad);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function renderRecordingToWav(): Promise<Blob> {
    const lastHit = recordedHitsRef.current.reduce((max, h) => Math.max(max, h.offsetSec), 0);
    const sampleRate = 44_100;
    const offline = new OfflineAudioContext(2, Math.ceil(Math.max(2, lastHit + 1.2) * sampleRate), sampleRate);
    const masterGain = offline.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(offline.destination);
    for (const hit of recordedHitsRef.current) scheduleDrumHit(offline, masterGain, hit.kind, { when: hit.offsetSec, kit: DEFAULT_KIT });
    return audioBufferToWavBlob(await offline.startRendering());
  }

  async function publishGuest() {
    if (recordedHitsRef.current.length === 0) return;
    setPhase("saving");
    try {
      const wav = await renderRecordingToWav();
      await stashGuestMix(wav, `phone-studio-${Date.now()}.wav`);
      try { window.localStorage.setItem(GUEST_RESUME_FLAG, "1"); } catch {}
      void postFunnelEvent({ event: FUNNEL_EVENTS.guestPublishStash, source: "studio_try_phone", properties: { sizeBytes: wav.size, hits: recordedHitsRef.current.length } });
      router.push("/studio/try/save");
    } catch (err) {
      console.error("[PhoneStudio] publish failed", err);
      setPhase("idle");
      alert(err instanceof Error ? err.message : "Couldn't save your beat. Try again.");
    }
  }

  async function shareGuest() {
    if (recordedHitsRef.current.length === 0) return;
    setPhase("sharing"); setShareUrl(null);
    try {
      const wav = await renderRecordingToWav();
      const form = new FormData(); form.append("audio", wav, `phone-studio-${Date.now()}.wav`);
      const res = await fetch("/api/guest-share", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { shareUrl?: string; error?: string };
      if (!res.ok || !data.shareUrl) { alert(data.error ?? "Couldn't make a share link. Try again."); setPhase("idle"); return; }
      setShareUrl(data.shareUrl); setPhase("idle");
      void postFunnelEvent({ event: FUNNEL_EVENTS.guestShareLinkCreated, source: "studio_try_phone", properties: { sizeBytes: wav.size, hits: recordedHitsRef.current.length } });
      if (navigator.share) { try { await navigator.share({ title: "Made on EMS Studio", text: "Listen to the beat I just made:", url: data.shareUrl }); return; } catch {} }
      try { await navigator.clipboard.writeText(data.shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch {}
    } catch (err) {
      console.error("[PhoneStudio] share failed", err);
      setPhase("idle");
      alert(err instanceof Error ? err.message : "Couldn't make a share link.");
    }
  }

  useEffect(() => () => {
    if (recordTimeoutRef.current !== null) window.clearTimeout(recordTimeoutRef.current);
    playbackTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    ctxRef.current?.close().catch(() => undefined);
  }, []);

  return (
    <main id="main-content" className="fixed inset-0 overflow-hidden bg-[#07070b] text-white">
      <div className="flex h-full min-h-0 pt-[65px]">
        <aside className="flex w-[76px] shrink-0 flex-col items-center gap-2 border-r border-white/10 bg-black/70 px-2 py-3">
          <Link href="/" className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">EMS</Link>
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`w-full rounded-xl border px-1 py-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${mode === item.id ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]"}`}
              aria-pressed={mode === item.id}
            >
              <span className="block text-[11px] font-black uppercase tracking-widest">{item.label}</span>
              <span className="mt-0.5 block text-[8px] uppercase tracking-widest opacity-55">{item.sub}</span>
            </button>
          ))}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#0d0d14]/95 px-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/60">Studio Workspace</p>
              <h1 className="truncate text-sm font-black uppercase tracking-[0.18em] text-white">{mode} page · no scroll workspace</h1>
            </div>
            <button type="button" onClick={recording ? stopRecording : startRecording} className={`min-h-9 rounded-full px-3 text-xs font-black uppercase tracking-widest ${recording ? "bg-red-500 text-white animate-pulse" : "border border-red-400/40 bg-red-500/10 text-red-100"}`}>{recording ? "Stop Rec" : "Record"}</button>
            <button type="button" onClick={playing ? stopPlayback : playRecording} disabled={!hasRecording} className="min-h-9 rounded-full border border-white/15 bg-white/[0.04] px-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-35">{playing ? "Stop" : "Play"}</button>
            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-1 sm:flex">
              <button type="button" onClick={() => setBpm((b) => Math.max(60, b - 5))} className="h-7 w-7 rounded-full bg-white/5 font-black">−</button>
              <span className="w-10 text-center font-mono text-sm font-black">{bpm}</span>
              <button type="button" onClick={() => setBpm((b) => Math.min(180, b + 5))} className="h-7 w-7 rounded-full bg-white/5 font-black">+</button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden p-3">
            {mode === "beat" && <BeatWorkspace activePad={activePad} fireHit={fireHit} getCtx={getCtx} bpm={bpm} />}
            {mode === "edit" && <EditWorkspace hits={recordedHitsRef.current} />}
            {mode === "mix" && <MixWorkspace />}
            {mode === "collab" && <CollabWorkspace setNotice={setNotice} />}
            {mode === "export" && <ExportWorkspace hasRecording={hasRecording} phase={phase} shareUrl={shareUrl} copied={copied} publishGuest={publishGuest} shareGuest={shareGuest} handoffToDesktop={handoffToDesktop} setCopied={setCopied} />}
          </div>

          <footer className="flex h-12 shrink-0 items-center justify-between gap-2 border-t border-white/10 bg-black/80 px-3 text-[11px] text-white/45">
            <span className="truncate">{notice ?? "Space = play/stop · 1/2/3/4 = pads · select a page from the left rail."}</span>
            <span className="hidden sm:inline">Haptics: {hapticIntensity}</span>
          </footer>
        </section>
      </div>
    </main>
  );
}

function BeatWorkspace({ activePad, fireHit, getCtx, bpm }: { activePad: DrumKind | null; fireHit: (kind: DrumKind, velocity?: number) => void; getCtx: () => AudioContext; bpm: number }) {
  return (
    <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[1fr_1.1fr]">
      <section className="min-h-0 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="mb-3 flex items-center justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/55">Beat Page</p><h2 className="text-xl font-black uppercase tracking-wider">Pads</h2></div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/50">{bpm} BPM</span>
        </div>
        <div className="grid h-[calc(100%-4rem)] grid-cols-2 gap-3">
          {PADS.map((p) => (
            <button key={p.kind} type="button" onPointerDown={(e) => { e.preventDefault(); fireHit(p.kind, e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.7); }} className={`rounded-2xl border text-left transition active:scale-[0.985] ${activePad === p.kind ? "border-cyan-300 bg-cyan-300/20" : "border-white/10 bg-black/40 hover:bg-white/[0.06]"}`}>
              <span className="block px-5 pt-5 text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Pad {p.keyHint}</span>
              <span className="block px-5 text-3xl font-black uppercase tracking-wider text-white">{p.label}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-3">
        <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/55">Step Sequencer</p><h2 className="text-xl font-black uppercase tracking-wider">Grid</h2></div>
        <div className="h-[calc(100%-4rem)] overflow-hidden rounded-xl border border-white/10 bg-black/35 p-2">
          <MobileBeatGrid getCtx={getCtx} bpm={bpm} kit={DEFAULT_KIT} />
        </div>
      </section>
    </div>
  );
}

function EditWorkspace({ hits }: { hits: RecordedHit[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/55">Edit Page</p><h2 className="text-xl font-black uppercase tracking-wider">Timeline</h2></div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="absolute inset-x-0 top-0 grid h-8 grid-cols-8 border-b border-white/10 text-[10px] text-white/35">{Array.from({ length: 8 }, (_, i) => <span key={i} className="border-r border-white/10 px-2 py-2">Bar {i + 1}</span>)}</div>
        <div className="absolute inset-x-0 top-12 space-y-3 px-3">
          {["Kick", "Snare", "Hat", "808"].map((lane, laneIndex) => <div key={lane} className="relative h-12 rounded-lg border border-white/10 bg-white/[0.025]"><span className="absolute left-3 top-3 text-xs font-black uppercase tracking-widest text-white/45">{lane}</span>{hits.filter((h) => h.kind.toLowerCase().includes(lane.toLowerCase()) || (lane === "808" && h.kind === "bass808")).map((hit, i) => <span key={`${hit.kind}-${i}`} className="absolute top-2 h-8 w-3 rounded bg-cyan-300" style={{ left: `${Math.min(92, hit.offsetSec * 10)}%` }} />)}</div>)}
        </div>
      </div>
    </div>
  );
}

function MixWorkspace() {
  const channels = ["Kick", "Snare", "Hat", "808", "Perc", "Vox", "FX", "Master"];
  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.025] p-3">
      <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/55">Mix Page</p><h2 className="text-xl font-black uppercase tracking-wider">Console</h2></div>
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
        {channels.map((channel, i) => <div key={channel} className="flex min-h-0 flex-col items-center rounded-xl border border-white/10 bg-black/45 p-2"><span className="text-[10px] font-black uppercase tracking-widest text-white/45">{channel}</span><div className="mt-3 flex flex-1 items-end"><div className="h-full w-2 rounded-full bg-white/10"><div className="mt-auto w-2 rounded-full bg-cyan-300" style={{ height: `${45 + ((i * 9) % 40)}%` }} /></div></div><input aria-label={`${channel} volume`} type="range" min="0" max="100" defaultValue={70} className="mt-3 h-24 w-8 [writing-mode:vertical-rl]" /><button type="button" className="mt-2 rounded border border-white/10 px-2 py-1 text-[10px] uppercase text-white/55">Mute</button></div>)}
      </div>
    </div>
  );
}

function CollabWorkspace({ setNotice }: { setNotice: (notice: string) => void }) {
  return <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] p-3"><StudioVideoCollab tier="starter" localName="Studio Owner" onUpgrade={() => setNotice("Upgrade plans will unlock more live studio video seats.")} /></div>;
}

function ExportWorkspace({ hasRecording, phase, shareUrl, copied, publishGuest, shareGuest, handoffToDesktop, setCopied }: { hasRecording: boolean; phase: "idle" | "saving" | "sharing"; shareUrl: string | null; copied: boolean; publishGuest: () => void; shareGuest: () => void; handoffToDesktop: () => void; setCopied: (copied: boolean) => void }) {
  return (
    <div className="grid h-full min-h-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-black/45 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-200/55">Export Page</p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-wider">Save or share</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">Keep this page focused: save the beat, create a share link, or move the pattern into the desktop studio.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={publishGuest} disabled={!hasRecording || phase !== "idle"} className="rounded-xl bg-gradient-to-r from-amber-400 to-fuchsia-500 px-3 py-4 text-sm font-black text-black disabled:opacity-40">{phase === "saving" ? "Saving…" : "Save"}</button>
          <button type="button" onClick={shareGuest} disabled={!hasRecording || phase !== "idle"} className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-3 py-4 text-sm font-black text-cyan-100 disabled:opacity-40">{phase === "sharing" ? "Linking…" : "Share"}</button>
          <button type="button" onClick={handoffToDesktop} disabled={!hasRecording} className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-4 text-sm font-black text-white disabled:opacity-40">Desktop</button>
        </div>
        {shareUrl && <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs"><p className="text-white/70">Share link:</p><div className="mt-1.5 flex items-center gap-2"><code className="block flex-1 truncate rounded bg-black/40 px-2 py-1 text-cyan-200">{shareUrl}</code><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch {} }} className="rounded bg-cyan-500 px-2 py-1 text-[11px] font-bold text-black">{copied ? "✓" : "Copy"}</button></div></div>}
      </div>
    </div>
  );
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels), sampleRate = buffer.sampleRate, samples = buffer.length, dataSize = samples * numChannels * 2;
  const buf = new ArrayBuffer(44 + dataSize), view = new DataView(buf); let off = 0;
  function writeStr(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i)); }
  writeStr("RIFF"); view.setUint32(off, 36 + dataSize, true); off += 4; writeStr("WAVE"); writeStr("fmt "); view.setUint32(off, 16, true); off += 4; view.setUint16(off, 1, true); off += 2; view.setUint16(off, numChannels, true); off += 2; view.setUint32(off, sampleRate, true); off += 4; view.setUint32(off, sampleRate * numChannels * 2, true); off += 4; view.setUint16(off, numChannels * 2, true); off += 2; view.setUint16(off, 16, true); off += 2; writeStr("data"); view.setUint32(off, dataSize, true); off += 4;
  const channels: Float32Array[] = []; for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < samples; i++) for (let c = 0; c < numChannels; c++) { const s = Math.max(-1, Math.min(1, channels[c][i] ?? 0)); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2; }
  return new Blob([buf], { type: "audio/wav" });
}
