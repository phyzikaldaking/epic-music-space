"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import StudioPageShell from "@/components/studio/StudioPageShell";
import { useStudioMidiBridge } from "../try/useStudioMidiBridge";

type BeatTrackKind = "drum" | "bass" | "melody" | "fx";
type BeatTrack = { id: string; name: string; kind: BeatTrackKind; color: string; level: number; pan: number; muted: boolean; padKind: DrumKind; pattern: boolean[] };
type PianoInstrument = DrumKind | "melody";
type FactoryCategory = "drums" | "808" | "keys" | "synth" | "guitar" | "strings" | "brass" | "fx" | "melody" | "misc";
type FactorySound = { id: string; name: string; url: string; category: FactoryCategory; instrument?: string; bpm?: number; key?: string; size?: number };
type PadAssignment = { name: string; url: string; size?: number; type?: string; assignedAt: string; sliceStart?: number; sliceDuration?: number };
type PadAssignments = Partial<Record<DrumKind, PadAssignment>>;
type DecodedPadBuffers = Partial<Record<DrumKind, AudioBuffer>>;
type PianoNote = { id: string; pitch: string; start: number; duration: number; velocity: number; instrument: PianoInstrument };
type SamplerChop = { id: string; name: string; index: number; start: number; duration: number; pad?: DrumKind };
type SamplerAnalysis = { name: string; duration: number; sampleRate: number; channels: number; estimatedBitDepth: number; estimatedBitrateKbps: number; sourceBpm: number; targetBpm: number; bars: number; beats: number; stretchRatio: number; chops: SamplerChop[]; url: string; buffer: AudioBuffer };

const DEFAULT_KIT: DrumKitId = "trap";
const SESSION_ID = "ems-beat-machine-session";
const PROJECT_ID = "ems-default-project";
const PAD_ASSIGNMENTS_STORAGE_KEY = "ems-beat-machine-pad-assignments-v2";
const COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b"];
const STEPS = Array.from({ length: 16 }, (_, index) => index + 1);
const PIANO_PITCHES = ["C6", "B5", "A#5", "A5", "G#5", "G5", "F#5", "F5", "E5", "D#5", "D5", "C#5", "C5", "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4"];
const NOTE_INDEX = PIANO_PITCHES.slice().reverse().reduce<Record<string, number>>((acc, pitch, index) => { acc[pitch] = index; return acc; }, {});
const NOTE_FREQ: Record<string, number> = {
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, E4: 329.63, F4: 349.23, "F#4": 369.99, G4: 392, "G#4": 415.3, A4: 440, "A#4": 466.16, B4: 493.88,
  C5: 523.25, "C#5": 554.37, D5: 587.33, "D#5": 622.25, E5: 659.25, F5: 698.46, "F#5": 739.99, G5: 783.99, "G#5": 830.61, A5: 880, "A#5": 932.33, B5: 987.77, C6: 1046.5,
};
const PADS: { label: string; kind: DrumKind; color: string; hotkey: string }[] = [
  { label: "Kick", kind: "kick", color: "#17fff4", hotkey: "1" },
  { label: "Snare", kind: "snare", color: "#ff34df", hotkey: "2" },
  { label: "Clap", kind: "clap", color: "#f6d63d", hotkey: "3" },
  { label: "Hat", kind: "hat", color: "#42ff56", hotkey: "4" },
  { label: "Open", kind: "openHat", color: "#a855ff", hotkey: "5" },
  { label: "Perc", kind: "perc", color: "#ff7a2f", hotkey: "6" },
  { label: "808", kind: "bass808", color: "#23d4ff", hotkey: "7" },
  { label: "Crash", kind: "crash", color: "#ff4f8b", hotkey: "8" },
];
const PIANO_INSTRUMENTS: { label: string; value: PianoInstrument; color: string }[] = [
  { label: "Melody", value: "melody", color: "#42ff56" },
  ...PADS.map((pad) => ({ label: pad.label, value: pad.kind, color: pad.color })),
];
const LIBRARY_CATEGORIES: { label: string; value: "all" | FactoryCategory }[] = [
  { label: "All", value: "all" }, { label: "Pianos / Keys", value: "keys" }, { label: "Synths", value: "synth" }, { label: "Guitars", value: "guitar" },
  { label: "Strings", value: "strings" }, { label: "Brass", value: "brass" }, { label: "Melodies", value: "melody" }, { label: "Drums", value: "drums" }, { label: "808", value: "808" }, { label: "FX", value: "fx" },
];
const INITIAL_TRACKS: BeatTrack[] = [
  { id: "kick", name: "Kick", kind: "drum", padKind: "kick", color: "#17fff4", level: 88, pan: 0, muted: false, pattern: STEPS.map((step) => [1, 5, 9, 13].includes(step)) },
  { id: "snare", name: "Snare / Clap", kind: "drum", padKind: "snare", color: "#ff34df", level: 76, pan: 0, muted: false, pattern: STEPS.map((step) => [5, 13].includes(step)) },
  { id: "hat", name: "Hi-Hats", kind: "drum", padKind: "hat", color: "#42ff56", level: 64, pan: 8, muted: false, pattern: STEPS.map((step) => step % 2 === 1) },
  { id: "bass", name: "808 Bass", kind: "bass", padKind: "bass808", color: "#f6d63d", level: 82, pan: -4, muted: false, pattern: STEPS.map((step) => [1, 4, 9, 12, 15].includes(step)) },
  { id: "melody", name: "Melody One-Shots", kind: "melody", padKind: "openHat", color: "#42ff56", level: 70, pan: 0, muted: false, pattern: STEPS.map(() => false) },
];
const INITIAL_NOTES: PianoNote[] = [
  { id: "n1", pitch: "C5", start: 0, duration: 2, velocity: 0.8, instrument: "melody" },
  { id: "n2", pitch: "D#5", start: 2, duration: 2, velocity: 0.75, instrument: "melody" },
  { id: "n3", pitch: "G5", start: 4, duration: 2, velocity: 0.82, instrument: "melody" },
  { id: "n4", pitch: "C5", start: 8, duration: 1, velocity: 0.9, instrument: "kick" },
  { id: "n5", pitch: "G5", start: 10, duration: 1, velocity: 0.75, instrument: "hat" },
];

function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; const tag = el?.tagName?.toLowerCase(); return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable); }
function pitchSemisFromC5(pitch: string) { return (NOTE_INDEX[pitch] ?? NOTE_INDEX.C5 ?? 12) - (NOTE_INDEX.C5 ?? 12); }
function isDrumInstrument(value: PianoInstrument): value is DrumKind { return value !== "melody"; }
function instrumentColor(value: PianoInstrument) { return PIANO_INSTRUMENTS.find((item) => item.value === value)?.color ?? "#42ff56"; }
function downloadText(filename: string, text: string, type = "application/json") { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function downloadUrl(url: string, filename: string) { const a = document.createElement("a"); a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noreferrer"; a.click(); }
function normalizePadAssignments(raw: unknown): PadAssignments { if (!raw || typeof raw !== "object") return {}; const input = raw as Record<string, Partial<PadAssignment>>; return PADS.reduce<PadAssignments>((acc, pad) => { const item = input[pad.kind]; if (item?.url && item?.name) acc[pad.kind] = { name: String(item.name), url: String(item.url), size: Number(item.size ?? 0), type: String(item.type ?? "audio/*"), assignedAt: String(item.assignedAt ?? new Date().toISOString()), sliceStart: typeof item.sliceStart === "number" ? item.sliceStart : undefined, sliceDuration: typeof item.sliceDuration === "number" ? item.sliceDuration : undefined }; return acc; }, {}); }
function loadStoredAssignments(): PadAssignments { if (typeof window === "undefined") return {}; try { return normalizePadAssignments(JSON.parse(window.localStorage.getItem(PAD_ASSIGNMENTS_STORAGE_KEY) ?? "{}")); } catch { return {}; } }
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("Could not read audio file.")); reader.readAsDataURL(file); }); }
async function decodeAudioUrl(ctx: AudioContext, url: string) { const res = await fetch(url); const arrayBuffer = await res.arrayBuffer(); return ctx.decodeAudioData(arrayBuffer.slice(0)); }
function formatSeconds(value: number) { return `${value.toFixed(2)}s`; }

export default function BeatMachineClient() {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(18);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [tracks, setTracks] = useState<BeatTrack[]>(INITIAL_TRACKS);
  const [selectedTrack, setSelectedTrack] = useState("kick");
  const [pianoNotes, setPianoNotes] = useState<PianoNote[]>(INITIAL_NOTES);
  const [pianoInstrument, setPianoInstrument] = useState<PianoInstrument>("kick");
  const [pianoVelocity, setPianoVelocity] = useState(0.82);
  const [currentStep, setCurrentStep] = useState(0);
  const [notice, setNotice] = useState("Beat machine ready.");
  const [selectedAssignPad, setSelectedAssignPad] = useState<DrumKind>("kick");
  const [padAssignments, setPadAssignments] = useState<PadAssignments>({});
  const [decodedPadBuffers, setDecodedPadBuffers] = useState<DecodedPadBuffers>({});
  const [melodyAssignment, setMelodyAssignment] = useState<PadAssignment | null>(null);
  const [melodyBuffer, setMelodyBuffer] = useState<AudioBuffer | null>(null);
  const [factorySounds, setFactorySounds] = useState<FactorySound[]>([]);
  const [factoryLoading, setFactoryLoading] = useState(false);
  const [soundQuery, setSoundQuery] = useState("");
  const [soundCategory, setSoundCategory] = useState<"all" | FactoryCategory>("keys");
  const [samplerAnalysis, setSamplerAnalysis] = useState<SamplerAnalysis | null>(null);
  const [samplerBars, setSamplerBars] = useState(4);
  const [samplerChops, setSamplerChops] = useState(8);
  const [samplerTargetBpm, setSamplerTargetBpm] = useState(92);
  const [samplerMode, setSamplerMode] = useState<"equal" | "transient">("equal");
  const [padRepeatEnabled, setPadRepeatEnabled] = useState(true);
  const [repeatDivision, setRepeatDivision] = useState(16);
  const [selectedRepeatPitch, setSelectedRepeatPitch] = useState("C5");

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const melodyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const kitImportInputRef = useRef<HTMLInputElement | null>(null);
  const samplerInputRef = useRef<HTMLInputElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const repeatRef = useRef<number | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepRef = useRef(0);
  const tracksRef = useRef(tracks);
  const notesRef = useRef(pianoNotes);
  const buffersRef = useRef(decodedPadBuffers);
  const assignmentsRef = useRef(padAssignments);
  const melodyBufferRef = useRef<AudioBuffer | null>(null);
  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  const midi = useStudioMidiBridge(SESSION_ID);

  const visibleSounds = useMemo(() => factorySounds.filter((sound) => (soundCategory === "all" || sound.category === soundCategory) && (!soundQuery || `${sound.name} ${sound.category} ${sound.instrument ?? ""} ${sound.key ?? ""}`.toLowerCase().includes(soundQuery.toLowerCase()))), [factorySounds, soundCategory, soundQuery]);
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [selectedTrack, tracks]);
  const selectedInstrumentColor = instrumentColor(pianoInstrument);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { notesRef.current = pianoNotes; }, [pianoNotes]);
  useEffect(() => { buffersRef.current = decodedPadBuffers; }, [decodedPadBuffers]);
  useEffect(() => { assignmentsRef.current = padAssignments; }, [padAssignments]);
  useEffect(() => { melodyBufferRef.current = melodyBuffer; }, [melodyBuffer]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { swingRef.current = swing; }, [swing]);
  useEffect(() => { const stored = loadStoredAssignments(); setPadAssignments(stored); void decodeAssignments(stored); void loadFactorySounds(); }, []);
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(PAD_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(padAssignments)); }, [padAssignments]);

  function getCtx() {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    const gain = ctx.createGain(); gain.gain.value = 0.86; gain.connect(ctx.destination);
    ctxRef.current = ctx; masterRef.current = gain; return ctx;
  }

  async function loadFactorySounds() {
    setFactoryLoading(true);
    try { const res = await fetch("/api/studio/sounds/library?limit=250", { cache: "no-store" }); const data = await res.json().catch(() => null); if (!res.ok || !Array.isArray(data?.sounds)) throw new Error(data?.error ?? "Sound library unavailable"); setFactorySounds(data.sounds as FactorySound[]); setNotice(`Loaded ${data.sounds.length} one-shots from audio-assets.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "One-shot library failed to load."); }
    finally { setFactoryLoading(false); }
  }

  async function decodeAssignments(assignments: PadAssignments) {
    const ctx = getCtx(); if (ctx.state === "suspended") void ctx.resume(); const next: DecodedPadBuffers = {};
    await Promise.all(PADS.map(async (pad) => { const assignment = assignments[pad.kind]; if (!assignment?.url) return; try { next[pad.kind] = await decodeAudioUrl(ctx, assignment.url); } catch { /* synth fallback */ } }));
    setDecodedPadBuffers(next);
  }

  function playSampleBuffer(buffer: AudioBuffer, when?: number, pitch = "C5", velocity = 0.82, offset = 0, duration?: number) {
    const ctx = getCtx(); if (ctx.state === "suspended") void ctx.resume();
    const source = ctx.createBufferSource(); const gain = ctx.createGain();
    const startAt = when ?? ctx.currentTime; source.buffer = buffer; source.playbackRate.setValueAtTime(Math.pow(2, pitchSemisFromC5(pitch) / 12), startAt); gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.2, velocity)), startAt);
    source.connect(gain); gain.connect(masterRef.current ?? ctx.destination); source.start(startAt, Math.max(0, offset), duration && duration > 0 ? duration : undefined);
  }

  async function assignUrlToPad(assignment: PadAssignment, pad: DrumKind = selectedAssignPad) {
    setPadAssignments((current) => ({ ...current, [pad]: assignment }));
    try { const buffer = await decodeAudioUrl(getCtx(), assignment.url); setDecodedPadBuffers((current) => ({ ...current, [pad]: buffer })); setNotice(`${assignment.name} assigned to ${pad}. Press key ${PADS.find((item) => item.kind === pad)?.hotkey ?? ""} or hold Roll.`); playPadBufferOrSynth(pad, 0.92, undefined, "C5", buffer, assignment); }
    catch { setNotice(`${assignment.name} assigned to ${pad}, but decode failed. Synth fallback remains active.`); }
  }
  async function assignFileToPad(file: File, pad: DrumKind = selectedAssignPad) { if (!file.type.startsWith("audio/")) { setNotice("Please upload an audio file for the pad."); return; } await assignUrlToPad({ name: file.name, url: await fileToDataUrl(file), size: file.size, type: file.type, assignedAt: new Date().toISOString() }, pad); }
  async function assignFactorySoundToPad(sound: FactorySound, pad: DrumKind = selectedAssignPad) { await assignUrlToPad({ name: sound.name, url: sound.url, size: sound.size, type: "audio/*", assignedAt: new Date().toISOString() }, pad); }
  async function setMelodySound(sound: FactorySound | PadAssignment) { const assignment: PadAssignment = { name: sound.name, url: sound.url, size: "size" in sound ? sound.size : undefined, type: "audio/*", assignedAt: new Date().toISOString() }; setMelodyAssignment(assignment); try { const buffer = await decodeAudioUrl(getCtx(), assignment.url); setMelodyBuffer(buffer); setPianoInstrument("melody"); setNotice(`${assignment.name} selected as melody one-shot.`); playSampleBuffer(buffer); } catch { setNotice(`${assignment.name} selected, but decode failed. Melody synth fallback remains active.`); } }
  async function assignMelodyFile(file: File) { if (!file.type.startsWith("audio/")) { setNotice("Please upload an audio file for melody."); return; } await setMelodySound({ name: file.name, url: await fileToDataUrl(file), size: file.size, type: file.type, assignedAt: new Date().toISOString() }); }
  function clearPadAssignment(pad: DrumKind) { setPadAssignments((current) => { const next = { ...current }; delete next[pad]; return next; }); setDecodedPadBuffers((current) => { const next = { ...current }; delete next[pad]; return next; }); setNotice(`${pad} returned to built-in synth sound.`); }

  function playPadBufferOrSynth(kind: DrumKind, velocity = 0.92, when?: number, pitch = "C5", overrideBuffer?: AudioBuffer, overrideAssignment?: PadAssignment) {
    const buffer = overrideBuffer ?? buffersRef.current[kind]; const assignment = overrideAssignment ?? assignmentsRef.current[kind];
    if (buffer && assignment?.sliceDuration) { playSampleBuffer(buffer, when, pitch, velocity, assignment.sliceStart ?? 0, assignment.sliceDuration); }
    else if (buffer) { playSampleBuffer(buffer, when, pitch, velocity); }
    else { const ctx = getCtx(); scheduleDrumHit(ctx, masterRef.current ?? ctx.destination, kind, { kit: DEFAULT_KIT, when: when ?? ctx.currentTime, velocity, pitchSemis: pitchSemisFromC5(pitch) }); }
  }
  const firePad = useCallback((kind: DrumKind, label: string, velocity = 0.92, when?: number, pitch = selectedRepeatPitch) => { if (getCtx().state === "suspended") void getCtx().resume(); playPadBufferOrSynth(kind, velocity, when, pitch); setActivePad(label); window.setTimeout(() => setActivePad(null), 90); }, [selectedRepeatPitch]);

  function stopPadRepeat() { if (repeatRef.current) window.clearInterval(repeatRef.current); repeatRef.current = null; }
  function startPadRepeat(kind: DrumKind, label: string) {
    firePad(kind, label, 0.95, undefined, selectedRepeatPitch);
    if (!padRepeatEnabled) return;
    stopPadRepeat();
    const intervalMs = Math.max(35, (60_000 / Math.max(40, bpmRef.current)) * (4 / repeatDivision));
    repeatRef.current = window.setInterval(() => firePad(kind, label, 0.9, undefined, selectedRepeatPitch), intervalMs);
  }

  const playMelodyNote = useCallback((pitch: string, when?: number, duration = 0.28, velocity = 0.7) => {
    if (melodyBufferRef.current) { playSampleBuffer(melodyBufferRef.current, when, pitch, velocity); return; }
    const ctx = getCtx(); if (ctx.state === "suspended") void ctx.resume(); const now = when ?? ctx.currentTime; const osc = ctx.createOscillator(); const gain = ctx.createGain(); const filter = ctx.createBiquadFilter();
    osc.type = "triangle"; osc.frequency.value = NOTE_FREQ[pitch] ?? 440; filter.type = "lowpass"; filter.frequency.value = 3600;
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * 0.22), now + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, duration));
    osc.connect(filter); filter.connect(gain); gain.connect(masterRef.current ?? ctx.destination); osc.start(now); osc.stop(now + Math.max(0.1, duration + 0.04));
  }, []);
  const playPianoNote = useCallback((note: PianoNote, when?: number, stepDuration = 0.16) => { const duration = stepDuration * Math.max(0.25, note.duration); if (isDrumInstrument(note.instrument)) playPadBufferOrSynth(note.instrument, note.velocity, when, note.pitch); else playMelodyNote(note.pitch, when, duration, note.velocity); }, [playMelodyNote]);

  const playStep = useCallback((stepIndex: number, when?: number) => {
    const ctx = getCtx(); const stepDuration = 60 / bpmRef.current / 4; const swung = stepIndex % 2 === 1 ? (swingRef.current / 100) * stepDuration * 0.5 : 0; const hitTime = (when ?? ctx.currentTime + 0.025) + swung;
    tracksRef.current.forEach((track) => { if (!track.muted && track.pattern[stepIndex]) firePad(track.padKind, track.name, Math.max(0.1, track.level / 100), hitTime); });
    notesRef.current.filter((note) => note.start === stepIndex).forEach((note) => playPianoNote(note, hitTime, stepDuration));
  }, [firePad, playPianoNote]);
  function schedulerTick() { const ctx = getCtx(); const stepDuration = 60 / bpmRef.current / 4; while (nextStepTimeRef.current < ctx.currentTime + 0.12) { playStep(stepRef.current, nextStepTimeRef.current); setCurrentStep(stepRef.current); stepRef.current = (stepRef.current + 1) % 16; nextStepTimeRef.current += stepDuration; } }
  function startSequencer() { const ctx = getCtx(); if (ctx.state === "suspended") void ctx.resume(); if (schedulerRef.current) window.clearInterval(schedulerRef.current); setPlaying(true); setNotice("Low-latency MPC sequencer playing."); nextStepTimeRef.current = ctx.currentTime + 0.035; schedulerTick(); schedulerRef.current = window.setInterval(schedulerTick, 25); }
  function stopSequencer() { if (schedulerRef.current) window.clearInterval(schedulerRef.current); schedulerRef.current = null; setPlaying(false); setNotice("Sequencer stopped."); }

  async function analyzeSamplerFile(file: File) {
    if (!file.type.startsWith("audio/")) { setNotice("Upload an audio file for the AI sampler."); return; }
    const url = await fileToDataUrl(file); const buffer = await decodeAudioUrl(getCtx(), url); const duration = buffer.duration; const beats = samplerBars * 4; const sourceBpm = Math.max(40, Math.min(240, Math.round((beats * 60) / Math.max(0.1, duration))));
    const chopCount = Math.max(1, samplerChops); const chopDuration = duration / chopCount;
    const chops = Array.from({ length: chopCount }, (_, index) => ({ id: `chop-${Date.now()}-${index}`, name: `Chop ${index + 1}`, index, start: index * chopDuration, duration: chopDuration, pad: PADS[index]?.kind }));
    setSamplerAnalysis({ name: file.name, duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, estimatedBitDepth: 16, estimatedBitrateKbps: Math.round((buffer.sampleRate * buffer.numberOfChannels * 16) / 1000), sourceBpm, targetBpm: samplerTargetBpm, bars: samplerBars, beats, stretchRatio: samplerTargetBpm / sourceBpm, chops, url, buffer });
    setNotice(`AI Sampler analyzed ${file.name}: ${sourceBpm} BPM, ${buffer.sampleRate} Hz, ${chopCount} chops.`);
  }
  function rechopSampler() { const current = samplerAnalysis; if (!current) return; const duration = current.duration; const chopDuration = duration / samplerChops; const chops = Array.from({ length: samplerChops }, (_, index) => ({ id: `chop-${Date.now()}-${index}`, name: `Chop ${index + 1}`, index, start: index * chopDuration, duration: chopDuration, pad: PADS[index]?.kind })); const sourceBpm = Math.max(40, Math.min(240, Math.round(((samplerBars * 4) * 60) / Math.max(0.1, duration)))); setSamplerAnalysis({ ...current, bars: samplerBars, beats: samplerBars * 4, sourceBpm, targetBpm: samplerTargetBpm, stretchRatio: samplerTargetBpm / sourceBpm, chops }); setNotice(`Sampler re-chopped into ${samplerChops} slices for ${samplerBars} bars.`); }
  async function assignChopToPad(chop: SamplerChop, pad: DrumKind = chop.pad ?? selectedAssignPad) { if (!samplerAnalysis) return; await assignUrlToPad({ name: `${samplerAnalysis.name} · ${chop.name}`, url: samplerAnalysis.url, size: undefined, type: "audio/*", assignedAt: new Date().toISOString(), sliceStart: chop.start, sliceDuration: chop.duration }, pad); }
  async function assignAllChopsToPads() { if (!samplerAnalysis) return; for (const chop of samplerAnalysis.chops.slice(0, PADS.length)) await assignChopToPad(chop, PADS[chop.index]?.kind ?? selectedAssignPad); setNotice("Sampler chops assigned across pads 1-8."); }
  function exportSamplerMap() { if (!samplerAnalysis) return; downloadText("ems-ai-sampler-map.json", JSON.stringify({ sample: samplerAnalysis.name, duration: samplerAnalysis.duration, sourceBpm: samplerAnalysis.sourceBpm, targetBpm: samplerAnalysis.targetBpm, sampleRate: samplerAnalysis.sampleRate, chops: samplerAnalysis.chops }, null, 2)); }

  function toggleStep(trackId: string, stepIndex: number) { setTracks((current) => current.map((track) => track.id === trackId ? { ...track, pattern: track.pattern.map((step, index) => index === stepIndex ? !step : step) } : track)); }
  function updateTrack(trackId: string, patch: Partial<BeatTrack>) { setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track)); }
  function addTrack(kind: BeatTrackKind) { const index = tracks.length + 1; const padKind: DrumKind = kind === "bass" ? "bass808" : kind === "fx" ? "perc" : kind === "melody" ? "openHat" : "kick"; const track: BeatTrack = { id: `beat-track-${Date.now()}`, name: kind === "bass" ? `808 ${index}` : kind === "melody" ? `Melody ${index}` : kind === "fx" ? `FX ${index}` : `Drum ${index}`, kind, padKind, color: COLORS[index % COLORS.length], level: 66, pan: 0, muted: false, pattern: STEPS.map((step) => kind === "drum" ? step % 4 === 1 : false) }; setTracks((current) => [...current, track]); setSelectedTrack(track.id); }
  function togglePianoNote(pitch: string, start: number) { const existing = pianoNotes.find((note) => note.pitch === pitch && note.start === start && note.instrument === pianoInstrument); if (existing) { setPianoNotes((current) => current.filter((note) => note.id !== existing.id)); return; } const note: PianoNote = { id: `note-${Date.now()}-${pianoInstrument}-${pitch}-${start}`, pitch, start, duration: pianoInstrument === "melody" ? 1 : 0.5, velocity: pianoVelocity, instrument: pianoInstrument }; setPianoNotes((current) => [...current, note]); playPianoNote(note, undefined, 60 / bpm / 4); }
  function exportKit() { downloadText("ems-mpc-ai-sampler-kit.json", JSON.stringify({ version: 3, bpm, swing, padAssignments, melodyAssignment, pianoNotes, tracks, sampler: samplerAnalysis ? { name: samplerAnalysis.name, sourceBpm: samplerAnalysis.sourceBpm, targetBpm: samplerAnalysis.targetBpm, bars: samplerAnalysis.bars, chops: samplerAnalysis.chops } : null, exportedAt: new Date().toISOString() }, null, 2)); }
  async function importKitFile(file: File) { try { const parsed = JSON.parse(await file.text()); const assignments = normalizePadAssignments(parsed.padAssignments ?? {}); setPadAssignments(assignments); if (Array.isArray(parsed.pianoNotes)) setPianoNotes(parsed.pianoNotes); if (Array.isArray(parsed.tracks)) setTracks(parsed.tracks); if (typeof parsed.bpm === "number") setBpm(parsed.bpm); if (typeof parsed.swing === "number") setSwing(parsed.swing); await decodeAssignments(assignments); setNotice("Custom MPC kit imported."); } catch { setNotice("Kit import failed. Upload an EMS kit JSON."); } }

  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (isTypingTarget(event.target)) return; if (event.code === "Space" && !event.repeat) { event.preventDefault(); playing ? stopSequencer() : startSequencer(); } const pad = PADS[Number(event.key) - 1]; if (pad) firePad(pad.kind, pad.label); } window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [firePad, playing]);
  useEffect(() => { if (playing) { stopSequencer(); startSequencer(); } return () => { if (schedulerRef.current) window.clearInterval(schedulerRef.current); }; }, [bpm]);
  useEffect(() => () => { if (schedulerRef.current) window.clearInterval(schedulerRef.current); stopPadRepeat(); ctxRef.current?.close().catch(() => undefined); }, []);

  const midiGuard = midi.status === "ready" ? `${midi.devices.length} MIDI device(s) ready.` : midi.status === "unsupported" ? "MIDI unavailable. Pads still work." : "MIDI optional.";

  return <StudioPageShell>
    <div className="mx-auto max-w-[1900px] px-2 py-2 sm:px-4">
      <input ref={uploadInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void assignFileToPad(file); event.currentTarget.value = ""; }} />
      <input ref={melodyUploadInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void assignMelodyFile(file); event.currentTarget.value = ""; }} />
      <input ref={kitImportInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importKitFile(file); event.currentTarget.value = ""; }} />
      <input ref={samplerInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void analyzeSamplerFile(file); event.currentTarget.value = ""; }} />

      <header className="mb-2 rounded-xl border border-green-300/20 bg-[#080d10]/90 p-2 shadow-[0_0_24px_rgba(23,255,244,.08)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/studio/try" className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">← Studio</Link>
          <h1 className="mr-auto text-lg font-black uppercase tracking-wider sm:text-2xl">Beat Machine · AI Sampler</h1>
          <button onClick={playing ? stopSequencer : startSequencer} className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${playing ? "border-pink-300 bg-pink-400/20 text-pink-100" : "border-green-300 bg-green-300/15 text-green-100"}`}>{playing ? "Stop" : "Play"}</button>
          <button onClick={() => samplerInputRef.current?.click()} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">AI Sampler</button>
          <button onClick={() => void loadFactorySounds()} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">{factoryLoading ? "Loading" : "Load Sounds"}</button>
          <button onClick={() => uploadInputRef.current?.click()} className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-100">Upload Pad</button>
          <button onClick={() => melodyUploadInputRef.current?.click()} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">Upload Melody</button>
          <button onClick={exportKit} className="rounded-lg border border-pink-300/35 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-pink-100">Export Kit</button>
          <button onClick={() => kitImportInputRef.current?.click()} className="rounded-lg border border-purple-300/35 bg-purple-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-purple-100">Import Kit</button>
          <button onClick={midi.connect} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">MIDI</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/45"><span className="rounded-full border border-white/10 px-3 py-1">Step {currentStep + 1}</span><span className="rounded-full border border-white/10 px-3 py-1">{notice}</span><span className="rounded-full border border-white/10 px-3 py-1">{midiGuard}</span></div>
      </header>

      <section className="grid gap-3 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Panel title="AI Sampler" tone="cyan">
            <p className="mb-3 text-xs leading-5 text-white/55">Upload a sample and EMS will analyze duration, sample rate, estimated bitrate, source BPM, target BPM, bars, chops, and pad mapping.</p>
            <div className="mb-3 grid grid-cols-2 gap-2"><button onClick={() => samplerInputRef.current?.click()} className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-3 text-xs font-black uppercase text-cyan-100">Upload Sample</button><button onClick={rechopSampler} className="rounded-xl border border-green-300/35 bg-green-300/10 px-3 py-3 text-xs font-black uppercase text-green-100">Auto Chop</button></div>
            <div className="grid grid-cols-2 gap-2 text-xs"><Range label={`Bars ${samplerBars}`} min={1} max={8} value={samplerBars} onChange={setSamplerBars} /><Range label={`Chops ${samplerChops}`} min={2} max={16} value={samplerChops} onChange={setSamplerChops} /><Range label={`Target ${samplerTargetBpm} BPM`} min={60} max={180} value={samplerTargetBpm} onChange={setSamplerTargetBpm} /><label className="block"><span className="text-xs font-black uppercase text-white/50">Mode</span><select value={samplerMode} onChange={(event) => setSamplerMode(event.target.value as "equal" | "transient")} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-xs"><option value="equal">Equal Slices</option><option value="transient">Transient Assist</option></select></label></div>
            {samplerAnalysis ? <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3"><b className="block truncate text-sm uppercase text-cyan-100">{samplerAnalysis.name}</b><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] uppercase text-white/55"><span>Length {formatSeconds(samplerAnalysis.duration)}</span><span>{samplerAnalysis.sampleRate} Hz</span><span>{samplerAnalysis.channels} ch</span><span>{samplerAnalysis.estimatedBitrateKbps} kbps</span><span>Source {samplerAnalysis.sourceBpm} BPM</span><span>Stretch x{samplerAnalysis.stretchRatio.toFixed(2)}</span></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={assignAllChopsToPads} className="rounded-lg border border-yellow-300/30 px-2 py-2 text-[10px] font-black uppercase text-yellow-100">Assign 1-8</button><button onClick={exportSamplerMap} className="rounded-lg border border-pink-300/30 px-2 py-2 text-[10px] font-black uppercase text-pink-100">Export Map</button></div><div className="mt-3 grid max-h-48 gap-2 overflow-y-auto pr-1">{samplerAnalysis.chops.map((chop) => <div key={chop.id} className="rounded-lg border border-white/10 bg-white/[.03] p-2"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase text-white/70">{chop.name} · {formatSeconds(chop.start)}</span><button onClick={() => playSampleBuffer(samplerAnalysis.buffer, undefined, "C5", 0.9, chop.start, chop.duration)} className="rounded border border-cyan-300/25 px-2 py-1 text-[10px] uppercase text-cyan-100">Play</button></div><div className="mt-2 grid grid-cols-4 gap-1">{PADS.slice(0, 4).map((pad) => <button key={`${chop.id}-${pad.kind}`} onClick={() => void assignChopToPad(chop, pad.kind)} className="rounded border border-white/10 px-1 py-1 text-[9px] uppercase text-white/55">{pad.hotkey} {pad.label}</button>)}</div></div>)}</div></div> : <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/45">No sample loaded yet. Upload a song/sample/loop and the AI sampler appears here.</p>}
          </Panel>

          <Panel title="MPC Pad Repeat / Roll" tone="yellow">
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setPadRepeatEnabled(!padRepeatEnabled)} className={`rounded-xl border px-3 py-3 text-xs font-black uppercase ${padRepeatEnabled ? "border-green-300 bg-green-300/10 text-green-100" : "border-white/10 text-white/45"}`}>{padRepeatEnabled ? "Repeat On" : "Repeat Off"}</button><select value={repeatDivision} onChange={(event) => setRepeatDivision(Number(event.target.value))} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-xs"><option value={4}>1/4</option><option value={8}>1/8</option><option value={16}>1/16</option><option value={32}>1/32</option><option value={64}>1/64</option></select></div>
            <select value={selectedRepeatPitch} onChange={(event) => setSelectedRepeatPitch(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-xs">{PIANO_PITCHES.slice().reverse().map((pitch) => <option key={pitch} value={pitch}>{pitch}</option>)}</select>
            <p className="mt-2 text-xs text-white/45">Hold any pad below to roll: boom-boom-boom in tempo, like MPC note repeat.</p>
          </Panel>

          <Panel title="Pads / Assignments" tone="green">
            <div className="grid grid-cols-2 gap-2">{PADS.map((pad) => { const assigned = padAssignments[pad.kind]; return <button key={pad.kind} onMouseDown={() => startPadRepeat(pad.kind, pad.label)} onMouseUp={stopPadRepeat} onMouseLeave={stopPadRepeat} onTouchStart={() => startPadRepeat(pad.kind, pad.label)} onTouchEnd={stopPadRepeat} className={`min-h-24 rounded-xl border p-3 text-left transition ${activePad === pad.label ? "scale-95" : "hover:scale-[.98]"}`} style={{ background: pad.color, borderColor: pad.color, color: "#061014", boxShadow: activePad === pad.label ? `0 0 22px ${pad.color}` : undefined }}><span className="block text-lg font-black uppercase">{pad.label}</span><span className="block text-[10px] font-black uppercase opacity-70">Key {pad.hotkey} · {assigned ? assigned.name : "Synth"}</span></button>; })}</div>
            <div className="mt-2 grid gap-2">{PADS.map((pad) => <div key={`assign-${pad.kind}`} className="grid grid-cols-[54px_1fr_repeat(3,54px)] items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-2"><button onClick={() => { setSelectedAssignPad(pad.kind); setPianoInstrument(pad.kind); }} className="rounded-lg px-2 py-2 text-xs font-black text-black" style={{ background: pad.color }}>{pad.hotkey}</button><span className="truncate text-[10px] uppercase text-white/55">{padAssignments[pad.kind]?.name ?? "Built-in"}</span><button onClick={() => { setSelectedAssignPad(pad.kind); uploadInputRef.current?.click(); }} className="text-[9px] uppercase text-yellow-100">Upload</button><button onClick={() => firePad(pad.kind, pad.label)} className="text-[9px] uppercase text-cyan-100">Play</button><button onClick={() => clearPadAssignment(pad.kind)} className="text-[9px] uppercase text-red-100">Clear</button></div>)}</div>
          </Panel>
        </aside>

        <main className="min-w-0 space-y-3">
          <Panel title="One-Shot / Melody Browser" tone="green">
            <div className="mb-2 flex gap-2"><input value={soundQuery} onChange={(event) => setSoundQuery(event.target.value)} placeholder="Search piano, keys, synth, guitar, sample..." className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-xs" /><select value={soundCategory} onChange={(event) => setSoundCategory(event.target.value as "all" | FactoryCategory)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs">{LIBRARY_CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}</select></div>
            <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">{visibleSounds.length === 0 && <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/45">No sounds showing yet. Click Load Sounds or upload new melodies.</p>}{visibleSounds.map((sound) => <div key={sound.id} className="rounded-xl border border-white/10 bg-[#071015] p-2"><b className="block truncate text-xs uppercase text-green-100">{sound.name}</b><span className="text-[10px] uppercase text-white/40">{sound.category} · {sound.instrument ?? "one-shot"}{sound.key ? ` · ${sound.key}` : ""}{sound.bpm ? ` · ${sound.bpm} BPM` : ""}</span><div className="mt-2 grid grid-cols-4 gap-2"><button onClick={() => void setMelodySound(sound)} className="rounded border border-green-300/30 px-2 py-1 text-[10px] uppercase text-green-100">Melody</button><button onClick={() => void assignFactorySoundToPad(sound)} className="rounded border border-yellow-300/30 px-2 py-1 text-[10px] uppercase text-yellow-100">Pad</button><button onClick={() => { void decodeAudioUrl(getCtx(), sound.url).then((buffer) => playSampleBuffer(buffer)); }} className="rounded border border-cyan-300/30 px-2 py-1 text-[10px] uppercase text-cyan-100">Play</button><button onClick={() => downloadUrl(sound.url, sound.name)} className="rounded border border-white/10 px-2 py-1 text-[10px] uppercase text-white/60">DL</button></div></div>)}</div>
          </Panel>

          <Panel title="Universal Piano Roll" tone="green">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-white/45">Melody one-shots, drums, sampler chops, and pads all play from the same piano roll.</p><div className="flex flex-wrap gap-2"><select value={pianoInstrument} onChange={(event) => setPianoInstrument(event.target.value as PianoInstrument)} className="rounded-lg border border-green-300/35 bg-black px-3 py-1 text-[10px] font-black uppercase text-green-100">{PIANO_INSTRUMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button onClick={() => setPianoNotes([])} className="rounded-lg border border-red-300/35 px-3 py-1 text-[10px] font-black uppercase text-red-100">Clear Roll</button></div></div>
            <div className="overflow-auto rounded-xl border border-white/10 bg-black/45"><div className="min-w-[960px] p-2"><div className="grid grid-cols-[70px_repeat(16,minmax(48px,1fr))] gap-1 text-[9px] font-black uppercase text-white/35"><span>Note</span>{STEPS.map((step) => <span key={step} className={`text-center ${currentStep + 1 === step ? "text-green-200" : ""}`}>{step}</span>)}</div>{PIANO_PITCHES.map((pitch) => <div key={pitch} className="mt-1 grid grid-cols-[70px_repeat(16,minmax(48px,1fr))] gap-1"><button onClick={() => { const preview: PianoNote = { id: `preview-${pitch}`, pitch, start: currentStep, duration: 1, velocity: pianoVelocity, instrument: pianoInstrument }; playPianoNote(preview, undefined, 60 / bpm / 4); }} className={`rounded border px-2 py-1 text-left text-[10px] font-black ${pitch.includes("#") ? "border-white/10 bg-black text-white/70" : "border-white/15 bg-white/[.06] text-white"}`}>{pitch}</button>{STEPS.map((step, index) => { const note = pianoNotes.find((item) => item.pitch === pitch && item.start === index && item.instrument === pianoInstrument); const allNotes = pianoNotes.filter((item) => item.pitch === pitch && item.start === index); const color = note ? selectedInstrumentColor : allNotes[0] ? instrumentColor(allNotes[0].instrument) : undefined; return <button key={`${pitch}-${step}`} onClick={() => togglePianoNote(pitch, index)} className={`relative h-7 rounded border ${currentStep === index ? "ring-1 ring-green-200" : ""}`} style={{ background: color ? color : pitch.includes("#") ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.055)", borderColor: color ?? "rgba(255,255,255,.08)", boxShadow: color ? `0 0 12px ${color}66` : undefined }} aria-label={`${pianoInstrument} ${pitch} step ${step}`}>{allNotes.length > 1 && <span className="absolute right-1 top-1 text-[8px] font-black text-black">{allNotes.length}</span>}</button>; })}</div>)}</div></div>
          </Panel>

          <Panel title="16-Step Sequencer" tone="cyan">
            <div className="mb-3 flex flex-wrap gap-2"><button onClick={() => addTrack("drum")} className="rounded-lg border border-cyan-300/35 px-3 py-2 text-xs font-black uppercase text-cyan-100">+ Drum</button><button onClick={() => addTrack("bass")} className="rounded-lg border border-yellow-300/35 px-3 py-2 text-xs font-black uppercase text-yellow-100">+ 808</button><button onClick={() => addTrack("melody")} className="rounded-lg border border-green-300/35 px-3 py-2 text-xs font-black uppercase text-green-100">+ Melody</button><button onClick={exportKit} className="rounded-lg border border-pink-300/35 px-3 py-2 text-xs font-black uppercase text-pink-100">Export Kit</button><button onClick={() => kitImportInputRef.current?.click()} className="rounded-lg border border-purple-300/35 px-3 py-2 text-xs font-black uppercase text-purple-100">Import</button></div>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/45 p-2"><div className="min-w-[920px] space-y-2"><div className="grid grid-cols-[150px_repeat(16,minmax(38px,1fr))] gap-2 text-center text-[10px] font-black uppercase tracking-widest text-white/35"><span className="text-left">Track</span>{STEPS.map((step) => <span key={step} className={currentStep + 1 === step ? "text-green-200" : ""}>{step}</span>)}</div>{tracks.map((track) => <div key={track.id} className="grid grid-cols-[150px_repeat(16,minmax(38px,1fr))] gap-2"><button onClick={() => setSelectedTrack(track.id)} className={`rounded-lg border px-3 py-2 text-left text-xs font-black uppercase ${selectedTrack === track.id ? "border-green-300/70 bg-green-300/10" : "border-white/10 bg-white/[.03]"}`} style={{ color: track.color }}>{track.name}</button>{track.pattern.map((enabled, index) => <button key={`${track.id}-${index}`} onClick={() => toggleStep(track.id, index)} className={`h-9 rounded-lg border transition ${currentStep === index ? "ring-2 ring-white/60" : ""}`} style={{ borderColor: enabled ? track.color : "rgba(255,255,255,.12)", background: enabled ? track.color : "rgba(255,255,255,.035)", boxShadow: enabled ? `0 0 14px ${track.color}55` : undefined }} aria-label={`${track.name} step ${index + 1}`} />)}</div>)}</div></div>
          </Panel>

          <section className="grid gap-3 lg:grid-cols-2"><Panel title="Groove / Mixer" tone="yellow"><Range label={`BPM ${bpm}`} min={60} max={180} value={bpm} onChange={setBpm} /><Range label={`Swing ${swing}%`} min={0} max={60} value={swing} onChange={setSwing} /><Range label={`Piano velocity ${Math.round(pianoVelocity * 100)}%`} min={20} max={115} value={Math.round(pianoVelocity * 100)} onChange={(value) => setPianoVelocity(value / 100)} />{selected && <Range label={`${selected.name} level ${selected.level}%`} min={0} max={100} value={selected.level} onChange={(value) => updateTrack(selected.id, { level: value })} />}</Panel><Panel title="MPC Tools" tone="pink"><div className="grid grid-cols-2 gap-2"><Tool label="Random Fill" onClick={() => setTracks((current) => current.map((track) => track.id === selectedTrack ? { ...track, pattern: track.pattern.map((_, index) => index % 4 === 0 || Math.random() > 0.67) } : track))} /><Tool label="Humanize Hats" onClick={() => setSwing((value) => Math.min(60, value + 5))} /><Tool label="Quantize Roll" onClick={() => setPianoNotes((current) => current.map((note) => ({ ...note, start: Math.round(note.start) })))} /><Tool label="Half Time" onClick={() => setBpm((value) => Math.max(60, Math.round(value / 2)))} /><Tool label="Export Sampler" onClick={exportSamplerMap} /><Tool label="Assign Chops" onClick={() => void assignAllChopsToPads()} /></div></Panel></section>
        </main>
      </section>
    </div>
  </StudioPageShell>;
}

function Panel({ title, tone, children }: { title: string; tone: "green" | "cyan" | "yellow" | "pink"; children: ReactNode }) { const color = tone === "green" ? "text-green-200/70 border-green-300/20" : tone === "cyan" ? "text-cyan-200/70 border-cyan-300/20" : tone === "yellow" ? "text-yellow-200/70 border-yellow-300/20" : "text-pink-200/70 border-pink-300/20"; return <section className={`rounded-2xl border bg-black/45 p-3 ${color}`}><p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em]">{title}</p>{children}</section>; }
function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) { return <label className="mb-3 block"><span className="text-xs font-black uppercase text-white/50">{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-cyan-300" /></label>; }
function Tool({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-xs font-black uppercase tracking-widest text-white/70 hover:border-cyan-300/40 hover:text-cyan-100">{label}</button>; }
