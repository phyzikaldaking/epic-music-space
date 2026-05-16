"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scheduleDrumHit, type DrumKind, type DrumKitId } from "@/components/daw/beatMachine";
import StudioPageShell from "@/components/studio/StudioPageShell";
import { useStudioMidiBridge } from "../try/useStudioMidiBridge";

type BeatTrackKind = "drum" | "bass" | "melody" | "fx";
type BeatTrack = { id: string; name: string; kind: BeatTrackKind; color: string; level: number; pan: number; muted: boolean; padKind: DrumKind; pattern: boolean[] };
type PianoInstrument = DrumKind | "melody";
type PadAssignment = { name: string; url: string; size?: number; type?: string; assignedAt: string };
type PadAssignments = Partial<Record<DrumKind, PadAssignment>>;
type DecodedPadBuffers = Partial<Record<DrumKind, AudioBuffer>>;
type PianoNote = { id: string; pitch: string; start: number; duration: number; velocity: number; instrument: PianoInstrument };
type ArrangementSection = { id: string; name: string; color: string; patternId?: string; note: string };
type SavedPattern = { id: string; name: string; tracks: BeatTrack[]; bpm: number; swing: number; arrangement?: ArrangementSection[]; pianoNotes?: PianoNote[]; padAssignments?: PadAssignments; createdAt: string };
type FactoryCategory = "drums" | "808" | "keys" | "synth" | "guitar" | "strings" | "brass" | "fx" | "melody" | "misc";
type FactorySound = { id: string; name: string; url: string; source?: string; category: FactoryCategory; instrument?: string; bpm?: number; key?: string; size?: number; createdAt?: string };

const DEFAULT_KIT: DrumKitId = "trap";
const SESSION_ID = "ems-beat-machine-session";
const PROJECT_ID = "ems-default-project";
const PAD_ASSIGNMENTS_STORAGE_KEY = "ems-beat-machine-pad-assignments-v1";
const COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b"];
const STEPS = Array.from({ length: 16 }, (_, index) => index + 1);
const PIANO_PITCHES = ["C6", "B5", "A#5", "A5", "G#5", "G5", "F#5", "F5", "E5", "D#5", "D5", "C#5", "C5", "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4", "C#4", "C4"];
const NOTE_INDEX = PIANO_PITCHES.slice().reverse().reduce<Record<string, number>>((acc, pitch, index) => { acc[pitch] = index; return acc; }, {});
const PIANO_INSTRUMENTS: { label: string; value: PianoInstrument; color: string }[] = [
  { label: "Melody", value: "melody", color: "#42ff56" },
  { label: "Kick", value: "kick", color: "#17fff4" },
  { label: "Snare", value: "snare", color: "#ff34df" },
  { label: "Clap", value: "clap", color: "#f6d63d" },
  { label: "Hi-Hat", value: "hat", color: "#42ff56" },
  { label: "Open Hat", value: "openHat", color: "#a855ff" },
  { label: "Perc", value: "perc", color: "#ff7a2f" },
  { label: "808", value: "bass808", color: "#23d4ff" },
  { label: "Crash", value: "crash", color: "#ff4f8b" },
];
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
const MELODY_CATEGORIES: FactoryCategory[] = ["keys", "synth", "guitar", "strings", "brass", "melody", "misc"];
const LIBRARY_CATEGORIES: { label: string; value: "all" | FactoryCategory }[] = [
  { label: "All", value: "all" },
  { label: "Pianos / Keys", value: "keys" },
  { label: "Synths", value: "synth" },
  { label: "Guitars", value: "guitar" },
  { label: "Strings", value: "strings" },
  { label: "Brass", value: "brass" },
  { label: "Melodies", value: "melody" },
  { label: "Drums", value: "drums" },
  { label: "808", value: "808" },
  { label: "FX", value: "fx" },
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
const INITIAL_SECTIONS: ArrangementSection[] = ["Intro", "Verse", "Hook", "Bridge", "Drop", "Breakdown", "Outro", "Alt Hook"].map((name, index) => ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, color: COLORS[index % COLORS.length], note: "Drop saved patterns here." }));

function isTypingTarget(target: EventTarget | null) { const el = target as HTMLElement | null; const tag = el?.tagName?.toLowerCase(); return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable); }
function cloneTracks(tracks: BeatTrack[]) { return tracks.map((track) => ({ ...track, pattern: [...track.pattern] })); }
function cloneNotes(notes: PianoNote[]) { return notes.map((note) => ({ ...note })); }
function normalizeNote(note: any): PianoNote { return { id: String(note?.id ?? `note-${Date.now()}`), pitch: String(note?.pitch ?? "C5"), start: Number(note?.start ?? 0), duration: Number(note?.duration ?? 1), velocity: Number(note?.velocity ?? 0.75), instrument: (note?.instrument ?? "melody") as PianoInstrument }; }
function normalizePattern(raw: any): SavedPattern | null { if (!raw || typeof raw !== "object" || !Array.isArray(raw.tracks)) return null; return { id: String(raw.id), name: String(raw.name ?? "Pattern"), tracks: raw.tracks as BeatTrack[], bpm: Number(raw.bpm ?? 92), swing: Number(raw.swing ?? 0), arrangement: Array.isArray(raw.arrangement) ? raw.arrangement as ArrangementSection[] : undefined, pianoNotes: Array.isArray(raw.pianoNotes) ? raw.pianoNotes.map(normalizeNote) : undefined, padAssignments: normalizePadAssignments(raw.padAssignments), createdAt: String(raw.createdAt ?? raw.updatedAt ?? new Date().toISOString()) }; }
function downloadText(filename: string, text: string, type = "application/json") { const blob = new Blob([text], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function downloadUrl(url: string, filename: string) { const a = document.createElement("a"); a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noreferrer"; a.click(); }
function pitchSemisFromC5(pitch: string) { return (NOTE_INDEX[pitch] ?? NOTE_INDEX.C5 ?? 12) - (NOTE_INDEX.C5 ?? 12); }
function isDrumInstrument(value: PianoInstrument): value is DrumKind { return value !== "melody"; }
function instrumentColor(value: PianoInstrument) { return PIANO_INSTRUMENTS.find((item) => item.value === value)?.color ?? "#42ff56"; }
function normalizePadAssignments(raw: unknown): PadAssignments {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, Partial<PadAssignment>>;
  return PADS.reduce<PadAssignments>((acc, pad) => {
    const item = input[pad.kind];
    if (item?.url && item?.name) acc[pad.kind] = { name: String(item.name), url: String(item.url), size: Number(item.size ?? 0), type: String(item.type ?? "audio/*"), assignedAt: String(item.assignedAt ?? new Date().toISOString()) };
    return acc;
  }, {});
}
function loadStoredAssignments(): PadAssignments {
  if (typeof window === "undefined") return {};
  try { return normalizePadAssignments(JSON.parse(window.localStorage.getItem(PAD_ASSIGNMENTS_STORAGE_KEY) ?? "{}")); } catch { return {}; }
}
function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio file."));
    reader.readAsDataURL(file);
  });
}
async function decodeAudioUrl(ctx: AudioContext, url: string) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer.slice(0));
}

export default function BeatMachineClient() {
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [swing, setSwing] = useState(18);
  const [activePad, setActivePad] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState("kick");
  const [tracks, setTracks] = useState<BeatTrack[]>(INITIAL_TRACKS);
  const [pianoNotes, setPianoNotes] = useState<PianoNote[]>(INITIAL_NOTES);
  const [pianoInstrument, setPianoInstrument] = useState<PianoInstrument>("kick");
  const [pianoVelocity, setPianoVelocity] = useState(0.82);
  const [currentStep, setCurrentStep] = useState(0);
  const [savedPatterns, setSavedPatterns] = useState<SavedPattern[]>([]);
  const [sections, setSections] = useState<ArrangementSection[]>(INITIAL_SECTIONS);
  const [notice, setNotice] = useState("Beat machine ready.");
  const [syncing, setSyncing] = useState(false);
  const [selectedAssignPad, setSelectedAssignPad] = useState<DrumKind>("kick");
  const [padAssignments, setPadAssignments] = useState<PadAssignments>({});
  const [decodedPadBuffers, setDecodedPadBuffers] = useState<DecodedPadBuffers>({});
  const [melodyAssignment, setMelodyAssignment] = useState<PadAssignment | null>(null);
  const [melodyBuffer, setMelodyBuffer] = useState<AudioBuffer | null>(null);
  const [factorySounds, setFactorySounds] = useState<FactorySound[]>([]);
  const [factoryLoading, setFactoryLoading] = useState(false);
  const [soundQuery, setSoundQuery] = useState("");
  const [soundCategory, setSoundCategory] = useState<"all" | FactoryCategory>("keys");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const kitImportInputRef = useRef<HTMLInputElement | null>(null);
  const melodyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const schedulerRef = useRef<number | null>(null);
  const nextStepTimeRef = useRef(0);
  const stepRef = useRef(0);
  const tracksRef = useRef(tracks);
  const notesRef = useRef(pianoNotes);
  const buffersRef = useRef(decodedPadBuffers);
  const melodyBufferRef = useRef<AudioBuffer | null>(null);
  const bpmRef = useRef(bpm);
  const swingRef = useRef(swing);
  const midi = useStudioMidiBridge(SESSION_ID);
  const selected = useMemo(() => tracks.find((track) => track.id === selectedTrack) ?? tracks[0], [selectedTrack, tracks]);
  const visibleSounds = useMemo(() => factorySounds.filter((sound) => (soundCategory === "all" || sound.category === soundCategory) && (!soundQuery || `${sound.name} ${sound.category} ${sound.instrument ?? ""} ${sound.key ?? ""}`.toLowerCase().includes(soundQuery.toLowerCase()))), [factorySounds, soundCategory, soundQuery]);
  const melodySounds = useMemo(() => factorySounds.filter((sound) => MELODY_CATEGORIES.includes(sound.category)), [factorySounds]);

  useEffect(() => { tracksRef.current = tracks; }, [tracks]);
  useEffect(() => { notesRef.current = pianoNotes; }, [pianoNotes]);
  useEffect(() => { buffersRef.current = decodedPadBuffers; }, [decodedPadBuffers]);
  useEffect(() => { melodyBufferRef.current = melodyBuffer; }, [melodyBuffer]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { swingRef.current = swing; }, [swing]);
  useEffect(() => { const stored = loadStoredAssignments(); setPadAssignments(stored); void decodeAssignments(stored); void loadPatterns(); void loadFactorySounds(); }, []);
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem(PAD_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(padAssignments)); }, [padAssignments]);

  async function loadFactorySounds() {
    setFactoryLoading(true);
    try {
      const res = await fetch("/api/studio/sounds/library?limit=250", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.sounds)) throw new Error(data?.error ?? "Sound library unavailable");
      setFactorySounds(data.sounds as FactorySound[]);
      setNotice(`Loaded ${data.sounds.length} one-shots from audio-assets.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "One-shot library failed to load.");
    } finally {
      setFactoryLoading(false);
    }
  }

  async function loadPatterns() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/studio/beat-patterns?projectId=${encodeURIComponent(PROJECT_ID)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.patterns)) throw new Error(data?.error ?? "Pattern API unavailable");
      const patterns = data.patterns.map(normalizePattern).filter(Boolean) as SavedPattern[];
      setSavedPatterns(patterns);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Pattern sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function persistPattern(pattern: SavedPattern) {
    const res = await fetch("/api/studio/beat-patterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: PROJECT_ID, sessionId: SESSION_ID, ...pattern, arrangement: sections, pianoNotes, padAssignments }) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.pattern) throw new Error(data?.error ?? "Pattern save failed");
    return normalizePattern(data.pattern) ?? pattern;
  }

  function getCtx() {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: "interactive", sampleRate: 48000 });
    const gain = ctx.createGain();
    gain.gain.value = 0.86;
    gain.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = gain;
    return ctx;
  }

  async function decodeAssignments(assignments: PadAssignments) {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const next: DecodedPadBuffers = {};
    await Promise.all(PADS.map(async (pad) => {
      const assignment = assignments[pad.kind];
      if (!assignment?.url) return;
      try { next[pad.kind] = await decodeAudioUrl(ctx, assignment.url); } catch { /* keep synth fallback */ }
    }));
    setDecodedPadBuffers(next);
  }

  async function assignFileToPad(file: File, pad: DrumKind = selectedAssignPad) {
    if (!file.type.startsWith("audio/")) { setNotice("Please upload an audio file for the pad."); return; }
    const url = await fileToDataUrl(file);
    await assignUrlToPad({ name: file.name, url, size: file.size, type: file.type, assignedAt: new Date().toISOString() }, pad);
  }

  async function assignUrlToPad(assignment: PadAssignment, pad: DrumKind = selectedAssignPad) {
    setPadAssignments((current) => ({ ...current, [pad]: assignment }));
    try {
      const buffer = await decodeAudioUrl(getCtx(), assignment.url);
      setDecodedPadBuffers((current) => ({ ...current, [pad]: buffer }));
      setNotice(`${assignment.name} assigned to ${pad}. Press key ${PADS.find((item) => item.kind === pad)?.hotkey ?? ""} to play it.`);
      firePad(pad, PADS.find((item) => item.kind === pad)?.label ?? pad, 0.92, undefined, "C5", buffer);
    } catch {
      setNotice(`${assignment.name} assigned to ${pad}, but preview decode failed. Synth fallback remains active.`);
    }
  }

  async function assignFactorySoundToPad(sound: FactorySound, pad: DrumKind = selectedAssignPad) {
    await assignUrlToPad({ name: sound.name, url: sound.url, size: sound.size, type: "audio/*", assignedAt: new Date().toISOString() }, pad);
  }

  async function setMelodySound(sound: FactorySound | PadAssignment) {
    const assignment: PadAssignment = { name: sound.name, url: sound.url, size: "size" in sound ? sound.size : undefined, type: "audio/*", assignedAt: new Date().toISOString() };
    setMelodyAssignment(assignment);
    try {
      const buffer = await decodeAudioUrl(getCtx(), assignment.url);
      setMelodyBuffer(buffer);
      setPianoInstrument("melody");
      setNotice(`${assignment.name} selected as melody one-shot. Use the piano roll to play it.`);
      playSampleBuffer(buffer, undefined, "C5", 0.9);
    } catch {
      setNotice(`${assignment.name} selected, but decode failed. Melody synth fallback remains active.`);
    }
  }

  async function assignMelodyFile(file: File) {
    if (!file.type.startsWith("audio/")) { setNotice("Please upload an audio file for melody."); return; }
    const url = await fileToDataUrl(file);
    await setMelodySound({ name: file.name, url, size: file.size, type: file.type, assignedAt: new Date().toISOString() });
  }

  function clearPadAssignment(pad: DrumKind) {
    setPadAssignments((current) => { const next = { ...current }; delete next[pad]; return next; });
    setDecodedPadBuffers((current) => { const next = { ...current }; delete next[pad]; return next; });
    setNotice(`${pad} returned to built-in synth sound.`);
  }

  function exportKit() {
    downloadText("ems-custom-pad-kit.json", JSON.stringify({ version: 2, bpm, swing, padAssignments, melodyAssignment, pianoNotes, tracks, exportedAt: new Date().toISOString() }, null, 2));
    setNotice("Custom kit exported with melody one-shot and pad assignments.");
  }

  async function importKitFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const assignments = normalizePadAssignments(parsed.padAssignments ?? parsed.assignments ?? {});
      setPadAssignments(assignments);
      if (parsed.melodyAssignment?.url && parsed.melodyAssignment?.name) await setMelodySound(parsed.melodyAssignment as PadAssignment);
      if (Array.isArray(parsed.pianoNotes)) setPianoNotes(parsed.pianoNotes.map(normalizeNote));
      if (Array.isArray(parsed.tracks)) setTracks(parsed.tracks as BeatTrack[]);
      if (typeof parsed.bpm === "number") setBpm(parsed.bpm);
      if (typeof parsed.swing === "number") setSwing(parsed.swing);
      await decodeAssignments(assignments);
      setNotice("Custom kit imported and pads restored.");
    } catch {
      setNotice("Kit import failed. Upload the exported EMS custom pad kit JSON.");
    }
  }

  function clearMelodySound() {
    setMelodyAssignment(null);
    setMelodyBuffer(null);
    setNotice("Melody returned to built-in synth sound.");
  }

  function playSampleBuffer(buffer: AudioBuffer, when?: number, pitch = "C5", velocity = 0.82) {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(Math.pow(2, pitchSemisFromC5(pitch) / 12), when ?? ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(0.01, Math.min(1.2, velocity)), when ?? ctx.currentTime);
    source.connect(gain);
    gain.connect(masterRef.current ?? ctx.destination);
    source.start(when ?? ctx.currentTime);
  }

  const playMelodyNote = useCallback((pitch: string, when?: number, duration = 0.28, velocity = 0.7) => {
    if (melodyBufferRef.current) {
      playSampleBuffer(melodyBufferRef.current, when, pitch, velocity);
      return;
    }
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.value = NOTE_FREQ[pitch] ?? 440;
    filter.type = "lowpass";
    filter.frequency.value = 3600;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, velocity * 0.22), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, duration));
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterRef.current ?? ctx.destination);
    osc.start(now);
    osc.stop(now + Math.max(0.1, duration + 0.04));
  }, []);

  const playPianoNote = useCallback((note: PianoNote, when?: number, stepDuration = 0.16) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const duration = stepDuration * Math.max(0.25, note.duration);
    if (isDrumInstrument(note.instrument)) {
      scheduleDrumHit(ctx, masterRef.current ?? ctx.destination, note.instrument, { kit: DEFAULT_KIT, when: when ?? ctx.currentTime, velocity: note.velocity, pitchSemis: pitchSemisFromC5(note.pitch), sampleBuffer: buffersRef.current[note.instrument] ?? null });
    } else {
      playMelodyNote(note.pitch, when, duration, note.velocity);
    }
  }, [playMelodyNote]);

  const firePad = useCallback((kind: DrumKind, label: string, velocity = 0.92, when?: number, pitch = "C5", overrideBuffer?: AudioBuffer) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    scheduleDrumHit(ctx, masterRef.current ?? ctx.destination, kind, { kit: DEFAULT_KIT, when: when ?? ctx.currentTime, velocity, pitchSemis: pitchSemisFromC5(pitch), sampleBuffer: overrideBuffer ?? buffersRef.current[kind] ?? null });
    setActivePad(label);
    window.setTimeout(() => setActivePad(null), 120);
  }, []);

  const playStep = useCallback((stepIndex: number, when?: number) => {
    const ctx = getCtx();
    const stepDuration = 60 / bpmRef.current / 4;
    const swung = stepIndex % 2 === 1 ? (swingRef.current / 100) * stepDuration * 0.5 : 0;
    const hitTime = (when ?? ctx.currentTime + 0.025) + swung;
    tracksRef.current.forEach((track) => { if (!track.muted && track.pattern[stepIndex]) firePad(track.padKind, track.name, Math.max(0.1, track.level / 100), hitTime); });
    notesRef.current.filter((note) => note.start === stepIndex).forEach((note) => playPianoNote(note, hitTime, stepDuration));
  }, [firePad, playPianoNote]);

  function schedulerTick() {
    const ctx = getCtx();
    const stepDuration = 60 / bpmRef.current / 4;
    while (nextStepTimeRef.current < ctx.currentTime + 0.12) {
      playStep(stepRef.current, nextStepTimeRef.current);
      setCurrentStep(stepRef.current);
      stepRef.current = (stepRef.current + 1) % 16;
      nextStepTimeRef.current += stepDuration;
    }
  }

  function startSequencer() {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();
    if (schedulerRef.current) window.clearInterval(schedulerRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPlaying(true);
    setNotice("Low-latency piano-roll sequencer playing.");
    nextStepTimeRef.current = ctx.currentTime + 0.035;
    schedulerTick();
    schedulerRef.current = window.setInterval(schedulerTick, 25);
  }
  function stopSequencer() { if (schedulerRef.current) window.clearInterval(schedulerRef.current); if (timerRef.current) window.clearInterval(timerRef.current); schedulerRef.current = null; timerRef.current = null; setPlaying(false); setNotice("Sequencer stopped."); }
  function toggleStep(trackId: string, stepIndex: number) { setTracks((current) => current.map((track) => track.id === trackId ? { ...track, pattern: track.pattern.map((step, index) => index === stepIndex ? !step : step) } : track)); }
  function updateTrack(trackId: string, patch: Partial<BeatTrack>) { setTracks((current) => current.map((track) => track.id === trackId ? { ...track, ...patch } : track)); }
  function addTrack(kind: BeatTrackKind) { const index = tracks.length + 1; const padKind: DrumKind = kind === "bass" ? "bass808" : kind === "fx" ? "perc" : kind === "melody" ? "openHat" : "kick"; const track: BeatTrack = { id: `beat-track-${Date.now()}`, name: kind === "bass" ? `808 ${index}` : kind === "melody" ? `Melody ${index}` : kind === "fx" ? `FX ${index}` : `Drum ${index}`, kind, padKind, color: COLORS[index % COLORS.length], level: 66, pan: 0, muted: false, pattern: STEPS.map((step) => kind === "drum" ? step % 4 === 1 : step === 1 || step === 9) }; setTracks((current) => [...current, track]); setSelectedTrack(track.id); setNotice(`${track.name} added.`); }
  async function savePattern() { const optimistic: SavedPattern = { id: `pattern-${Date.now()}`, name: `Pattern ${savedPatterns.length + 1}`, tracks: cloneTracks(tracks), bpm, swing, arrangement: sections, pianoNotes: cloneNotes(pianoNotes), padAssignments, createdAt: new Date().toISOString() }; setSyncing(true); try { const saved = await persistPattern(optimistic); setSavedPatterns((current) => [saved, ...current.filter((item) => item.id !== saved.id)].slice(0, 24)); setNotice(`${saved.name} saved to project.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Backend save failed."); } finally { setSyncing(false); } }
  function duplicatePattern() { setTracks((current) => current.map((track, index) => ({ ...track, id: `dup-${Date.now()}-${track.id}`, name: `${track.name} Copy`, color: COLORS[(index + 2) % COLORS.length], pattern: [...track.pattern] }))); setNotice("Pattern duplicated into new track copies."); }
  function clearTrack() { setTracks((current) => current.map((track) => track.id === selected.id ? { ...track, pattern: STEPS.map(() => false) } : track)); setNotice(`${selected.name} cleared.`); }
  function randomFill() { setTracks((current) => current.map((track) => track.id === selected.id ? { ...track, pattern: STEPS.map((_, index) => index % 4 === 0 || Math.random() > 0.67) } : track)); setNotice(`Random fill added to ${selected.name}.`); }
  function humanizeHats() { setTracks((current) => current.map((track) => track.id.toLowerCase().includes("hat") || track.padKind === "hat" ? { ...track, pattern: track.pattern.map((step, index) => step || (index % 2 === 1 && Math.random() > 0.72)) } : track)); setSwing((value) => Math.min(60, value + 5)); setNotice("Hats humanized with extra ghost steps and swing."); }
  function quantize() { setPianoNotes((current) => current.map((note) => ({ ...note, start: Math.max(0, Math.min(15, Math.round(note.start))) }))); setNotice("Piano roll and pattern quantized to 16 steps."); }
  function halfTime() { setTracks((current) => current.map((track) => ({ ...track, pattern: track.pattern.map((_, index) => Boolean(track.pattern[(index * 2) % 16])) }))); setPianoNotes((current) => current.map((note) => ({ ...note, start: Math.min(15, Math.floor(note.start / 2) * 2) }))); setNotice("Half-time pattern generated."); }
  function saveKit() { exportKit(); }
  function exportLoop() { downloadText("ems-beat-loop-session.json", JSON.stringify({ tracks, pianoNotes, bpm, swing, padAssignments, melodyAssignment, savedAt: new Date().toISOString() }, null, 2)); setNotice("Loop session exported with one-shots and pad assignments."); }
  function dragPattern(event: React.DragEvent<HTMLButtonElement>, pattern: SavedPattern) { event.dataTransfer.setData("application/x-ems-pattern", pattern.id); }
  function dropPattern(event: React.DragEvent<HTMLDivElement>, sectionId: string) { event.preventDefault(); const patternId = event.dataTransfer.getData("application/x-ems-pattern"); const pattern = savedPatterns.find((item) => item.id === patternId); if (!pattern) return; setSections((current) => current.map((section) => section.id === sectionId ? { ...section, patternId, note: `${pattern.name} · ${pattern.bpm} BPM` } : section)); setNotice(`${pattern.name} assigned to ${sectionId}.`); }
  function togglePianoNote(pitch: string, start: number) { const existing = pianoNotes.find((note) => note.pitch === pitch && note.start === start && note.instrument === pianoInstrument); if (existing) { setPianoNotes((current) => current.filter((note) => note.id !== existing.id)); return; } const note: PianoNote = { id: `note-${Date.now()}-${pianoInstrument}-${pitch}-${start}`, pitch, start, duration: pianoInstrument === "melody" ? 1 : 0.5, velocity: pianoVelocity, instrument: pianoInstrument }; setPianoNotes((current) => [...current, note]); playPianoNote(note, undefined, 60 / bpm / 4); setNotice(`${pianoInstrument} note added at ${pitch}.`); }
  function clearPianoRoll() { setPianoNotes((current) => current.filter((note) => note.instrument !== pianoInstrument)); setNotice(`${pianoInstrument} piano roll cleared.`); }
  function clearAllPianoRoll() { setPianoNotes([]); setNotice("All piano-roll instruments cleared."); }
  function seedPianoRoll() { setPianoNotes(INITIAL_NOTES.map((note) => ({ ...note, id: `${note.id}-${Date.now()}` }))); setNotice("Universal piano-roll pattern restored."); }

  useEffect(() => { function onKeyDown(event: KeyboardEvent) { if (isTypingTarget(event.target)) return; if (event.code === "Space" && !event.repeat) { event.preventDefault(); playing ? stopSequencer() : startSequencer(); } const pad = PADS[Number(event.key) - 1]; if (pad) firePad(pad.kind, pad.label); } window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [firePad, playing]);
  useEffect(() => { if (playing) { stopSequencer(); startSequencer(); } return () => { if (schedulerRef.current) window.clearInterval(schedulerRef.current); if (timerRef.current) window.clearInterval(timerRef.current); }; }, [bpm]);
  useEffect(() => () => { if (schedulerRef.current) window.clearInterval(schedulerRef.current); if (timerRef.current) window.clearInterval(timerRef.current); ctxRef.current?.close().catch(() => undefined); }, []);

  const midiGuard = midi.status === "unsupported" ? "MIDI unavailable. Pads and sequencer still work." : midi.status === "ready" ? `${midi.devices.length} MIDI device(s) ready.` : "MIDI optional.";
  const selectedInstrumentColor = instrumentColor(pianoInstrument);

  return <StudioPageShell>
    <div className="mx-auto max-w-[1800px] px-2 py-2 sm:px-4">
      <input ref={uploadInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void assignFileToPad(file); event.currentTarget.value = ""; }} />
      <input ref={melodyUploadInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void assignMelodyFile(file); event.currentTarget.value = ""; }} />
      <input ref={kitImportInputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importKitFile(file); event.currentTarget.value = ""; }} />
      <header className="mb-2 rounded-xl border border-green-300/20 bg-[#080d10]/90 p-2 shadow-[0_0_24px_rgba(23,255,244,.08)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/studio/try" className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">← Studio</Link>
          <h1 className="mr-auto text-lg font-black uppercase tracking-wider sm:text-2xl">Beat Machine</h1>
          <button onClick={playing ? stopSequencer : startSequencer} className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest ${playing ? "border-pink-300 bg-pink-400/20 text-pink-100" : "border-green-300 bg-green-300/15 text-green-100"}`}>{playing ? "Stop" : "Play"}</button>
          <button onClick={() => void loadFactorySounds()} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">{factoryLoading ? "Loading Sounds" : "Load Sounds"}</button>
          <button onClick={() => uploadInputRef.current?.click()} className="rounded-lg border border-yellow-300/35 bg-yellow-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-yellow-100">Upload Drum</button>
          <button onClick={() => melodyUploadInputRef.current?.click()} className="rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">Upload Melody</button>
          <button onClick={exportKit} className="rounded-lg border border-pink-300/35 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-pink-100">Export Kit</button>
          <button onClick={() => kitImportInputRef.current?.click()} className="rounded-lg border border-purple-300/35 bg-purple-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-purple-100">Import Kit</button>
          <div className="flex items-center rounded-full border border-white/10 bg-black/45 px-1 py-1"><button onClick={() => setBpm((value) => Math.max(60, value - 1))} className="h-7 w-7 rounded-full bg-white/5">-</button><span className="w-12 text-center font-mono text-sm font-black text-cyan-100">{bpm}</span><button onClick={() => setBpm((value) => Math.min(180, value + 1))} className="h-7 w-7 rounded-full bg-white/5">+</button></div>
          <button onClick={midi.connect} className="rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-green-100">MIDI</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/45"><span className="rounded-full border border-white/10 px-3 py-1">Step {currentStep + 1}</span><span className="rounded-full border border-white/10 px-3 py-1">{notice}</span><span className="rounded-full border border-white/10 px-3 py-1">{melodySounds.length} melodic one-shots</span><span className="rounded-full border border-white/10 px-3 py-1">{midi.lastEvent ? `Last MIDI: ${midi.lastEvent}` : midiGuard}</span></div>
      </header>

      <section className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <Panel title="One-Shot / Melody Browser" tone="green">
            <p className="mb-2 text-xs leading-5 text-white/50">Pianos, keys, synths, guitars, strings, brass, melodies, drums and FX from Supabase audio-assets. Preview, assign to Melody, assign to a pad, or download.</p>
            <div className="mb-2 flex gap-2"><input value={soundQuery} onChange={(event) => setSoundQuery(event.target.value)} placeholder="Search piano, keys, synth, guitar..." className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black px-3 py-2 text-xs" /><select value={soundCategory} onChange={(event) => setSoundCategory(event.target.value as "all" | FactoryCategory)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs">{LIBRARY_CATEGORIES.map((cat) => <option key={cat.value} value={cat.value}>{cat.label}</option>)}</select></div>
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">{visibleSounds.length === 0 && <p className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-sm text-white/45">No sounds showing yet. Click Load Sounds or upload new melodies.</p>}{visibleSounds.map((sound) => <div key={sound.id} className="rounded-xl border border-white/10 bg-[#071015] p-2"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="block truncate text-xs uppercase text-green-100">{sound.name}</b><span className="text-[10px] uppercase text-white/40">{sound.category} · {sound.instrument ?? "one-shot"}{sound.key ? ` · ${sound.key}` : ""}{sound.bpm ? ` · ${sound.bpm} BPM` : ""}</span></div><button onClick={() => downloadUrl(sound.url, sound.name)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/60">Download</button></div><div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => void setMelodySound(sound)} className="rounded-lg border border-green-300/30 px-2 py-1 text-[10px] font-black uppercase text-green-100">Melody</button><button onClick={() => void assignFactorySoundToPad(sound)} className="rounded-lg border border-yellow-300/30 px-2 py-1 text-[10px] font-black uppercase text-yellow-100">To Pad</button><button onClick={() => { void decodeAudioUrl(getCtx(), sound.url).then((buffer) => playSampleBuffer(buffer)); }} className="rounded-lg border border-cyan-300/30 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Preview</button></div></div>)}</div>
          </Panel>
          <Panel title="Sound Assignment Center" tone="yellow">
            <p className="mb-3 text-xs leading-5 text-white/50">Pick a pad, upload/assign a sound, then press its number key. Every assignment is visible and exportable.</p>
            <div className="grid gap-2">{PADS.map((pad) => { const assigned = padAssignments[pad.kind]; return <div key={pad.kind} className={`rounded-xl border p-2 ${selectedAssignPad === pad.kind ? "bg-white/[.06]" : "bg-black/30"}`} style={{ borderColor: selectedAssignPad === pad.kind ? pad.color : "rgba(255,255,255,.1)" }}><div className="flex items-center gap-2"><button onClick={() => { setSelectedAssignPad(pad.kind); setPianoInstrument(pad.kind); }} className="grid h-10 w-10 place-items-center rounded-lg font-black text-black" style={{ background: pad.color }}>{pad.hotkey}</button><div className="min-w-0 flex-1"><b className="block truncate text-xs uppercase" style={{ color: pad.color }}>{pad.label}</b><span className="block truncate text-[10px] uppercase text-white/40">{assigned ? assigned.name : "Built-in synth sound"}</span></div><button onClick={() => firePad(pad.kind, pad.label)} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/70">Preview</button></div><div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => { setSelectedAssignPad(pad.kind); uploadInputRef.current?.click(); }} className="rounded-lg border border-yellow-300/30 px-2 py-1 text-[10px] font-black uppercase text-yellow-100">Upload</button><button onClick={() => { setSelectedAssignPad(pad.kind); setPianoInstrument(pad.kind); setNotice(`${pad.label} selected. Click piano-roll notes to pitch it.`); }} className="rounded-lg border border-cyan-300/30 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Roll</button><button onClick={() => clearPadAssignment(pad.kind)} className="rounded-lg border border-red-300/30 px-2 py-1 text-[10px] font-black uppercase text-red-100">Clear</button></div></div>; })}</div>
          </Panel>
          <Panel title="Melody One-Shot" tone="cyan">
            <p className="text-xs text-white/50">Current melody sound:</p><p className="mt-1 truncate text-sm font-black uppercase text-cyan-100">{melodyAssignment?.name ?? "Built-in triangle synth"}</p><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => melodyUploadInputRef.current?.click()} className="rounded-lg border border-cyan-300/30 px-2 py-2 text-[10px] font-black uppercase text-cyan-100">Upload</button><button onClick={() => { if (melodyBuffer) playSampleBuffer(melodyBuffer); else playMelodyNote("C5"); }} className="rounded-lg border border-green-300/30 px-2 py-2 text-[10px] font-black uppercase text-green-100">Preview</button><button onClick={clearMelodySound} className="rounded-lg border border-red-300/30 px-2 py-2 text-[10px] font-black uppercase text-red-100">Clear</button></div>
          </Panel>
        </aside>

        <main className="min-w-0 space-y-3">
          <Panel title="Universal Piano Roll" tone="green">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-white/45">Select Melody to play pianos/keys/synths/strings from the one-shot browser. Drums and pads still pitch from the same roll.</p><div className="flex flex-wrap gap-2"><select value={pianoInstrument} onChange={(event) => setPianoInstrument(event.target.value as PianoInstrument)} className="rounded-lg border border-green-300/35 bg-black px-3 py-1 text-[10px] font-black uppercase text-green-100">{PIANO_INSTRUMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><button onClick={seedPianoRoll} className="rounded-lg border border-green-300/35 px-3 py-1 text-[10px] font-black uppercase text-green-100">Seed</button><button onClick={clearPianoRoll} className="rounded-lg border border-red-300/35 px-3 py-1 text-[10px] font-black uppercase text-red-100">Clear Selected</button><button onClick={clearAllPianoRoll} className="rounded-lg border border-red-300/35 px-3 py-1 text-[10px] font-black uppercase text-red-100">Clear All</button></div></div>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-white/45">{PIANO_INSTRUMENTS.map((item) => <button key={item.value} onClick={() => { setPianoInstrument(item.value); if (item.value !== "melody") setSelectedAssignPad(item.value); }} className={`rounded-full border px-3 py-1 ${pianoInstrument === item.value ? "bg-white/10" : "bg-black/30"}`} style={{ color: item.color, borderColor: pianoInstrument === item.value ? item.color : "rgba(255,255,255,.12)" }}>{item.label}</button>)}</div>
            <div className="overflow-auto rounded-xl border border-white/10 bg-black/45"><div className="min-w-[960px] p-2"><div className="grid grid-cols-[70px_repeat(16,minmax(48px,1fr))] gap-1 text-[9px] font-black uppercase text-white/35"><span>Note</span>{STEPS.map((step) => <span key={step} className={`text-center ${currentStep + 1 === step ? "text-green-200" : ""}`}>{step}</span>)}</div>{PIANO_PITCHES.map((pitch) => <div key={pitch} className="mt-1 grid grid-cols-[70px_repeat(16,minmax(48px,1fr))] gap-1"><button onClick={() => { const preview: PianoNote = { id: `preview-${pitch}`, pitch, start: currentStep, duration: 1, velocity: pianoVelocity, instrument: pianoInstrument }; playPianoNote(preview, undefined, 60 / bpm / 4); }} className={`rounded border px-2 py-1 text-left text-[10px] font-black ${pitch.includes("#") ? "border-white/10 bg-black text-white/70" : "border-white/15 bg-white/[.06] text-white"}`}>{pitch}</button>{STEPS.map((step, index) => { const note = pianoNotes.find((item) => item.pitch === pitch && item.start === index && item.instrument === pianoInstrument); const allNotes = pianoNotes.filter((item) => item.pitch === pitch && item.start === index); const color = note ? selectedInstrumentColor : allNotes[0] ? instrumentColor(allNotes[0].instrument) : undefined; return <button key={`${pitch}-${step}`} onClick={() => togglePianoNote(pitch, index)} className={`relative h-7 rounded border ${currentStep === index ? "ring-1 ring-green-200" : ""}`} style={{ background: color ? color : pitch.includes("#") ? "rgba(255,255,255,.025)" : "rgba(255,255,255,.055)", borderColor: color ?? "rgba(255,255,255,.08)", boxShadow: color ? `0 0 12px ${color}66` : undefined }} aria-label={`${pianoInstrument} ${pitch} step ${step}`}>{allNotes.length > 1 && <span className="absolute right-1 top-1 text-[8px] font-black text-black">{allNotes.length}</span>}</button>; })}</div>)}</div></div>
          </Panel>
          <Panel title="16-Step Sequencer" tone="cyan">
            <div className="mb-3 flex flex-wrap gap-2"><button onClick={() => addTrack("drum")} className="rounded-lg border border-cyan-300/35 px-3 py-2 text-xs font-black uppercase text-cyan-100">+ Drum</button><button onClick={() => addTrack("bass")} className="rounded-lg border border-yellow-300/35 px-3 py-2 text-xs font-black uppercase text-yellow-100">+ 808</button><button onClick={() => addTrack("melody")} className="rounded-lg border border-green-300/35 px-3 py-2 text-xs font-black uppercase text-green-100">+ Melody</button><button onClick={() => addTrack("fx")} className="rounded-lg border border-pink-300/35 px-3 py-2 text-xs font-black uppercase text-pink-100">+ FX</button></div>
            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/45 p-2"><div className="min-w-[920px] space-y-2"><div className="grid grid-cols-[150px_repeat(16,minmax(38px,1fr))] gap-2 text-center text-[10px] font-black uppercase tracking-widest text-white/35"><span className="text-left">Track</span>{STEPS.map((step) => <span key={step} className={currentStep + 1 === step ? "text-green-200" : ""}>{step}</span>)}</div>{tracks.map((track) => <div key={track.id} className="grid grid-cols-[150px_repeat(16,minmax(38px,1fr))] gap-2"><button onClick={() => setSelectedTrack(track.id)} className={`rounded-lg border px-3 py-2 text-left text-xs font-black uppercase ${selectedTrack === track.id ? "border-green-300/70 bg-green-300/10" : "border-white/10 bg-white/[.03]"}`} style={{ color: track.color }}>{track.name}</button>{track.pattern.map((enabled, index) => <button key={`${track.id}-${index}`} onClick={() => toggleStep(track.id, index)} className={`h-9 rounded-lg border transition ${currentStep === index ? "ring-2 ring-white/60" : ""}`} style={{ borderColor: enabled ? track.color : "rgba(255,255,255,.12)", background: enabled ? track.color : "rgba(255,255,255,.035)", boxShadow: enabled ? `0 0 14px ${track.color}55` : undefined }} aria-label={`${track.name} step ${index + 1}`} />)}</div>)}</div></div>
          </Panel>
          <section className="grid gap-3 lg:grid-cols-2"><Panel title="Groove / Track Mixer" tone="yellow"><div className="grid gap-2"><Range label={`Swing ${swing}%`} min={0} max={60} value={swing} onChange={setSwing} /><Range label={`Piano velocity ${Math.round(pianoVelocity * 100)}%`} min={20} max={115} value={Math.round(pianoVelocity * 100)} onChange={(value) => setPianoVelocity(value / 100)} />{tracks.map((track) => <div key={track.id} className="rounded-xl border border-white/10 bg-[#071015] p-3"><div className="flex items-center justify-between gap-3"><button onClick={() => setSelectedTrack(track.id)} className="font-black uppercase" style={{ color: track.color }}>{track.name}</button><button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${track.muted ? "border-pink-300 bg-pink-300/20 text-pink-100" : "border-white/10 text-white/45"}`}>{track.muted ? "Muted" : "Live"}</button></div><input aria-label={`${track.name} level`} type="range" min="0" max="100" value={track.level} onChange={(event) => updateTrack(track.id, { level: Number(event.target.value) })} className="mt-3 w-full accent-cyan-300" /></div>)}</div></Panel><Panel title="Pattern Tools" tone="pink"><div className="grid grid-cols-2 gap-2"><Tool label="Save Pattern" onClick={savePattern} /><Tool label="Export Loop" onClick={exportLoop} /><Tool label="Duplicate" onClick={duplicatePattern} /><Tool label="Clear Track" onClick={clearTrack} /><Tool label="Random Fill" onClick={randomFill} /><Tool label="Humanize Hats" onClick={humanizeHats} /><Tool label="Quantize" onClick={quantize} /><Tool label="Half-Time" onClick={halfTime} /><Tool label="Export Kit" onClick={exportKit} /><Tool label="Import Kit" onClick={() => kitImportInputRef.current?.click()} /></div></Panel></section>
          <Panel title="Arrangement Drag/Drop" tone="green"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{sections.map((section) => <div key={section.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropPattern(event, section.id)} className="min-h-28 rounded-xl border border-white/10 bg-[#071015] p-3"><div className="font-black uppercase" style={{ color: section.color }}>{section.name}</div><p className="mt-3 text-xs text-white/45">{section.note}</p></div>)}</div></Panel>
        </main>
      </section>
    </div>
  </StudioPageShell>;
}

function Panel({ title, tone, children }: { title: string; tone: "green" | "cyan" | "yellow" | "pink"; children: React.ReactNode }) {
  const color = tone === "green" ? "text-green-200/70 border-green-300/20" : tone === "cyan" ? "text-cyan-200/70 border-cyan-300/20" : tone === "yellow" ? "text-yellow-200/70 border-yellow-300/20" : "text-pink-200/70 border-pink-300/20";
  return <section className={`rounded-2xl border bg-black/45 p-3 ${color}`}><p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em]">{title}</p>{children}</section>;
}
function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) { return <label className="mb-3 block"><span className="text-xs font-black uppercase text-white/50">{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-cyan-300" /></label>; }
function Tool({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-xs font-black uppercase tracking-widest text-white/70 hover:border-cyan-300/40 hover:text-cyan-100">{label}</button>; }
