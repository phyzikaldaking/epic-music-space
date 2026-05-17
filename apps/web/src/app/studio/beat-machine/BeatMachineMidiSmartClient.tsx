"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeatMachineProClient from "./BeatMachineProClient";

type BankId = "A" | "B" | "C" | "D";
type PadRole = "kick" | "snare" | "hat" | "808" | "sample" | "melody" | "fx" | "empty";
type SmartSound = { id: string; name: string; url: string; instrument?: string; source?: string; createdAt?: string };
type SmartPad = { id: string; bank: BankId; number: number; name: string; role: PadRole; soundName?: string; soundUrl?: string; tune: number; gain: number; pan: number; reverse: boolean; trimStart: number; trimEnd: number; chokeGroup: string; color: string };
type SmartNote = { id: string; padId: string; step: number; length: number; velocity: number; selected?: boolean };
type HistoryEntry = { notes: SmartNote[]; label: string; at: string };

const BANKS: BankId[] = ["A", "B", "C", "D"];
const PAD_COLORS = ["#17fff4", "#ff34df", "#f6d63d", "#42ff56", "#a855ff", "#ff7a2f", "#23d4ff", "#ff4f8b", "#c4ff3d", "#ff3d71", "#3d7cff", "#ffffff", "#2dff9f", "#f2a900", "#a78bfa", "#fb7185"];
const SMART_KIT_KEY = "ems-smart-mpc-kit-v2";
const SMART_NOTES_KEY = "ems-smart-mpc-notes-v2";
const MY_SOUNDS_KEY = "ems-smart-mpc-my-sounds-v2";
const DEFAULT_PROJECT_ID = "ems-default-project";
const DEFAULT_SESSION_ID = "ems-smart-mpc-midi-session";

const COMMANDS = [
  { keys: "⌘Z", action: "Undo last MIDI edit" },
  { keys: "⇧⌘Z / ⌘Y", action: "Redo MIDI edit" },
  { keys: "⌫ / Delete", action: "Erase selected notes, or last note on selected pad" },
  { keys: "⌘A", action: "Select all notes on selected pad" },
  { keys: "⇧⌘A", action: "Select every MIDI note in the kit" },
  { keys: "Esc", action: "Clear note selection" },
  { keys: "⌘C", action: "Copy selected notes" },
  { keys: "⌘V", action: "Paste copied notes one step later" },
  { keys: "⌘D", action: "Duplicate selected notes" },
  { keys: "⌘S", action: "Save kit to cloud/backend" },
  { keys: "⌘E", action: "Export arrangement manifest" },
  { keys: "1-9, 0", action: "Select pads A1-A10 quickly" },
];

function createPads(): SmartPad[] {
  return BANKS.flatMap((bank) => Array.from({ length: 16 }, (_, index) => ({
    id: `${bank}${index + 1}`,
    bank,
    number: index + 1,
    name: `${bank}${index + 1}`,
    role: index === 0 ? "kick" : index === 1 ? "snare" : index < 6 ? "hat" : index < 10 ? "sample" : index < 13 ? "melody" : "empty",
    tune: 0,
    gain: 0.9,
    pan: 0,
    reverse: false,
    trimStart: 0,
    trimEnd: 100,
    chokeGroup: index < 6 ? "hats" : index < 10 ? "chops" : "none",
    color: PAD_COLORS[index % PAD_COLORS.length],
  })));
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(window.localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el?.isContentEditable);
}

function inferRole(name: string, fallback: PadRole): PadRole {
  const lower = name.toLowerCase();
  if (lower.includes("kick")) return "kick";
  if (lower.includes("snare") || lower.includes("clap")) return "snare";
  if (lower.includes("hat")) return "hat";
  if (lower.includes("808") || lower.includes("bass")) return "808";
  if (lower.includes("fx") || lower.includes("riser")) return "fx";
  if (lower.includes("key") || lower.includes("piano") || lower.includes("synth") || lower.includes("melody")) return "melody";
  return fallback === "empty" ? "sample" : fallback;
}

export default function BeatMachineMidiSmartClient() {
  const [activeBank, setActiveBank] = useState<BankId>("A");
  const [pads, setPads] = useState<SmartPad[]>(() => createPads());
  const [selectedPadId, setSelectedPadId] = useState("A1");
  const [notes, setNotes] = useState<SmartNote[]>([]);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [clipboard, setClipboard] = useState<SmartNote[]>([]);
  const [mySounds, setMySounds] = useState<SmartSound[]>([]);
  const [status, setStatus] = useState("MIDI command layer ready: add, erase, undo, redo, save.");
  const [arrangementBars, setArrangementBars] = useState(8);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bankPads = useMemo(() => pads.filter((pad) => pad.bank === activeBank), [pads, activeBank]);
  const selectedPad = useMemo(() => pads.find((pad) => pad.id === selectedPadId) ?? pads[0], [pads, selectedPadId]);
  const selectedNotes = useMemo(() => notes.filter((note) => note.selected), [notes]);
  const padNotes = useMemo(() => notes.filter((note) => note.padId === selectedPadId), [notes, selectedPadId]);
  const kitSnapshot = useMemo(() => ({ version: 2, pads, notes, arrangementBars, updatedAt: new Date().toISOString() }), [pads, notes, arrangementBars]);

  const commitNotes = useCallback((nextNotes: SmartNote[], label: string) => {
    setUndoStack((current) => [...current.slice(-48), { notes, label, at: new Date().toISOString() }]);
    setRedoStack([]);
    setNotes(nextNotes);
    setStatus(label);
  }, [notes]);

  const clearSelection = useCallback(() => {
    setNotes((current) => current.map((note) => ({ ...note, selected: false })));
    setStatus("MIDI note selection cleared.");
  }, []);

  const selectPadNotes = useCallback(() => {
    setNotes((current) => current.map((note) => ({ ...note, selected: note.padId === selectedPadId })));
    setStatus(`Selected all MIDI notes on ${selectedPadId}.`);
  }, [selectedPadId]);

  const selectAllNotes = useCallback(() => {
    setNotes((current) => current.map((note) => ({ ...note, selected: true })));
    setStatus("Selected every MIDI note in the kit.");
  }, []);

  const deleteSelectedNotes = useCallback(() => {
    const selected = notes.filter((note) => note.selected);
    if (selected.length > 0) {
      commitNotes(notes.filter((note) => !note.selected), `Deleted ${selected.length} selected MIDI note(s).`);
      return;
    }
    const lastPadNote = [...notes].reverse().find((note) => note.padId === selectedPadId);
    if (lastPadNote) {
      commitNotes(notes.filter((note) => note.id !== lastPadNote.id), `Deleted last MIDI note on ${selectedPadId}.`);
      return;
    }
    setStatus("No MIDI notes selected to delete.");
  }, [commitNotes, notes, selectedPadId]);

  const undo = useCallback(() => {
    const entry = undoStack.at(-1);
    if (!entry) { setStatus("Nothing to undo."); return; }
    setRedoStack((current) => [...current, { notes, label: "redo snapshot", at: new Date().toISOString() }]);
    setUndoStack((current) => current.slice(0, -1));
    setNotes(entry.notes);
    setStatus(`Undo: ${entry.label}`);
  }, [notes, undoStack]);

  const redo = useCallback(() => {
    const entry = redoStack.at(-1);
    if (!entry) { setStatus("Nothing to redo."); return; }
    setUndoStack((current) => [...current, { notes, label: "undo snapshot", at: new Date().toISOString() }]);
    setRedoStack((current) => current.slice(0, -1));
    setNotes(entry.notes);
    setStatus("Redo applied.");
  }, [notes, redoStack]);

  const copySelected = useCallback(() => {
    const selected = notes.filter((note) => note.selected);
    setClipboard(selected);
    setStatus(selected.length ? `Copied ${selected.length} MIDI note(s).` : "No selected notes to copy.");
  }, [notes]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard.length) { setStatus("Clipboard is empty."); return; }
    const pasted = clipboard.map((note) => ({ ...note, id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`, step: Math.min(15, note.step + 1), selected: true }));
    commitNotes([...notes.map((note) => ({ ...note, selected: false })), ...pasted], `Pasted ${pasted.length} MIDI note(s).`);
  }, [clipboard, commitNotes, notes]);

  const duplicateSelected = useCallback(() => {
    const selected = notes.filter((note) => note.selected);
    if (!selected.length) { setStatus("Select notes before duplicating."); return; }
    const copies = selected.map((note) => ({ ...note, id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`, step: Math.min(15, note.step + note.length), selected: true }));
    commitNotes([...notes.map((note) => ({ ...note, selected: false })), ...copies], `Duplicated ${copies.length} MIDI note(s).`);
  }, [commitNotes, notes]);

  const saveKitToCloud = useCallback(async () => {
    const tracks = BANKS.map((bank) => ({ id: `bank-${bank}`, name: `Bank ${bank}`, kind: "drum", color: "#17fff4", level: 90, pan: 0, muted: false, padKind: "kick", pattern: Array.from({ length: 16 }, (_, step) => notes.some((note) => note.padId.startsWith(bank) && note.step === step)) }));
    try {
      const res = await fetch("/api/studio/beat-patterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: `midi-kit-${Date.now()}`, projectId: DEFAULT_PROJECT_ID, sessionId: DEFAULT_SESSION_ID, name: `MIDI Smart MPC Kit ${new Date().toLocaleString()}`, bpm: 92, swing: 0, tracks, arrangement: [{ id: "midi-smart-kit", pads, notes, arrangementBars }] }) });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");
      setStatus("Saved MIDI Smart MPC kit to cloud/backend.");
    } catch {
      setStatus("Cloud save failed; local autosave is still active.");
    }
  }, [arrangementBars, notes, pads]);

  const exportArrangement = useCallback(() => {
    downloadJson("ems-midi-smart-mpc-arrangement.json", { type: "ems-midi-smart-mpc-arrangement", pads, notes, arrangementBars, midi: { erase: true, undo: true, redo: true, copy: true, paste: true, delete: true, macCommands: COMMANDS }, exportedAt: new Date().toISOString() });
    setStatus("Exported MIDI arrangement manifest.");
  }, [arrangementBars, notes, pads]);

  useEffect(() => {
    setPads(safeRead(SMART_KIT_KEY, createPads()));
    setNotes(safeRead(SMART_NOTES_KEY, []));
    setMySounds(safeRead(MY_SOUNDS_KEY, []));
  }, []);

  useEffect(() => { window.localStorage.setItem(SMART_KIT_KEY, JSON.stringify(pads)); }, [pads]);
  useEffect(() => { window.localStorage.setItem(SMART_NOTES_KEY, JSON.stringify(notes)); }, [notes]);
  useEffect(() => { window.localStorage.setItem(MY_SOUNDS_KEY, JSON.stringify(mySounds)); }, [mySounds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const isMacCommand = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (isMacCommand && key === "z" && !event.shiftKey) { event.preventDefault(); undo(); return; }
      if ((isMacCommand && key === "z" && event.shiftKey) || (isMacCommand && key === "y")) { event.preventDefault(); redo(); return; }
      if (isMacCommand && key === "s") { event.preventDefault(); void saveKitToCloud(); return; }
      if (isMacCommand && key === "e") { event.preventDefault(); exportArrangement(); return; }
      if (isMacCommand && key === "a" && event.shiftKey) { event.preventDefault(); selectAllNotes(); return; }
      if (isMacCommand && key === "a") { event.preventDefault(); selectPadNotes(); return; }
      if (isMacCommand && key === "c") { event.preventDefault(); copySelected(); return; }
      if (isMacCommand && key === "v") { event.preventDefault(); pasteClipboard(); return; }
      if (isMacCommand && key === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); deleteSelectedNotes(); return; }
      if (event.key === "Escape") { event.preventDefault(); clearSelection(); return; }
      if (!isMacCommand && /^[0-9]$/.test(event.key)) {
        const index = event.key === "0" ? 9 : Number(event.key) - 1;
        const pad = bankPads[index];
        if (pad) { event.preventDefault(); setSelectedPadId(pad.id); setStatus(`Selected pad ${pad.id}.`); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bankPads, clearSelection, copySelected, deleteSelectedNotes, duplicateSelected, exportArrangement, pasteClipboard, redo, saveKitToCloud, selectAllNotes, selectPadNotes, undo]);

  async function refreshMySounds() {
    try {
      const res = await fetch("/api/studio/sounds/library?limit=250", { cache: "no-store" });
      const data = await res.json();
      const sounds = Array.isArray(data?.sounds) ? data.sounds as SmartSound[] : [];
      setMySounds((current) => Array.from(new Map([...sounds, ...current].map((sound) => [sound.url || sound.id, sound])).values()).slice(0, 250));
      setStatus(`Loaded ${sounds.length} cloud sounds.`);
    } catch {
      setStatus("Cloud sound refresh failed; local My Sounds still available.");
    }
  }

  async function uploadSound(file: File) {
    const localUrl = URL.createObjectURL(file);
    const fallbackSound: SmartSound = { id: `local-${Date.now()}`, name: file.name, url: localUrl, source: "local", instrument: "custom", createdAt: new Date().toISOString() };
    setMySounds((current) => [fallbackSound, ...current].slice(0, 250));
    assignSoundToPad(fallbackSound);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("instrument", selectedPad.role === "empty" ? "custom" : selectedPad.role);
      const res = await fetch("/api/studio/sounds/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data?.sound) throw new Error(data?.error || "Upload failed");
      setMySounds((current) => [data.sound as SmartSound, ...current.filter((sound) => sound.id !== fallbackSound.id)].slice(0, 250));
      assignSoundToPad(data.sound as SmartSound);
      setStatus(`${file.name} uploaded to cloud and assigned to ${selectedPad.id}.`);
    } catch {
      setStatus(`${file.name} assigned locally. Cloud upload unavailable.`);
    }
  }

  function assignSoundToPad(sound: SmartSound, padId = selectedPadId) {
    setPads((current) => current.map((pad) => pad.id === padId ? { ...pad, soundName: sound.name, soundUrl: sound.url, role: inferRole(sound.name, pad.role), name: pad.name === pad.id ? `${pad.id} ${sound.name.slice(0, 10)}` : pad.name } : pad));
  }

  function padDragStart(sound: SmartSound, event: React.DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("application/x-ems-sound", JSON.stringify(sound));
  }

  function padDrop(padId: string, event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-ems-sound");
    if (!raw) return;
    try { assignSoundToPad(JSON.parse(raw) as SmartSound, padId); setStatus(`Sound assigned to ${padId}.`); } catch { setStatus("Drop failed."); }
  }

  function updateSelectedPad(patch: Partial<SmartPad>) {
    setPads((current) => current.map((pad) => pad.id === selectedPad.id ? { ...pad, ...patch } : pad));
  }

  function toggleNote(step: number, selectOnly = false) {
    const existing = notes.find((note) => note.padId === selectedPad.id && note.step === step);
    if (existing && selectOnly) {
      setNotes((current) => current.map((note) => ({ ...note, selected: note.id === existing.id ? !note.selected : note.selected })));
      setStatus(`${existing.selected ? "Deselected" : "Selected"} MIDI note on ${selectedPad.id} step ${step + 1}.`);
      return;
    }
    if (existing) {
      commitNotes(notes.filter((note) => note.id !== existing.id), `Erased MIDI note on ${selectedPad.id} step ${step + 1}.`);
      return;
    }
    commitNotes([...notes, { id: `note-${selectedPad.id}-${step}-${Date.now()}`, padId: selectedPad.id, step, length: 1, velocity: 92, selected: false }], `Added MIDI note on ${selectedPad.id} step ${step + 1}.`);
  }

  function updateNote(noteId: string, patch: Partial<SmartNote>) {
    commitNotes(notes.map((note) => note.id === noteId ? { ...note, ...patch } : note), "Updated MIDI note length/velocity.");
  }

  return <div className="min-h-screen bg-[#030607] text-white">
    <section className="mx-auto mb-2 max-w-[1900px] px-2 pt-2 sm:px-4">
      <div className="rounded-2xl border border-cyan-300/20 bg-black/60 p-3 shadow-[0_0_28px_rgba(23,255,244,.08)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200/70">MIDI edit command center</p>
            <h2 className="text-lg font-black uppercase tracking-wide text-white sm:text-2xl">Erase, undo, redo, save, Mac commands, and flexible MIDI editing</h2>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*" className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadSound(file); event.currentTarget.value = ""; }} />
          <button onClick={undo} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-black uppercase text-white/70">Undo ⌘Z</button>
          <button onClick={redo} className="rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-[10px] font-black uppercase text-white/70">Redo ⇧⌘Z</button>
          <button onClick={deleteSelectedNotes} className="rounded-xl border border-red-300/30 bg-red-300/10 px-3 py-2 text-[10px] font-black uppercase text-red-100">Erase/Delete</button>
          <button onClick={() => void saveKitToCloud()} className="rounded-xl border border-green-300/30 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">Save ⌘S</button>
          <button onClick={exportArrangement} className="rounded-xl border border-pink-300/30 bg-pink-300/10 px-3 py-2 text-[10px] font-black uppercase text-pink-100">Export ⌘E</button>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-white/70">{status}</div>
        <div className="mt-3 grid gap-2 md:grid-cols-4 xl:grid-cols-6">{COMMANDS.map((item) => <div key={item.keys} className="rounded-lg border border-cyan-300/15 bg-cyan-300/[.04] p-2"><b className="block text-[10px] text-cyan-100">{item.keys}</b><span className="text-[10px] text-white/45">{item.action}</span></div>)}</div>
      </div>
    </section>

    <section className="mx-auto mb-2 grid max-w-[1900px] gap-3 px-2 sm:px-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-white/10 bg-black/45 p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-auto text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">16-pad MIDI MPC layout</p>
          {BANKS.map((bank) => <button key={bank} onClick={() => setActiveBank(bank)} className={`rounded-xl border px-4 py-2 text-xs font-black uppercase ${activeBank === bank ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/45"}`}>Bank {bank}</button>)}
          <button onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Upload Sound</button>
        </div>
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-8 xl:grid-cols-4 2xl:grid-cols-8">
          {bankPads.map((pad) => <button key={pad.id} onClick={() => setSelectedPadId(pad.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => padDrop(pad.id, event)} className={`min-h-24 rounded-2xl border p-3 text-left transition ${selectedPad.id === pad.id ? "scale-[.98] ring-2 ring-white/50" : "hover:scale-[.99]"}`} style={{ background: pad.color, borderColor: pad.color, color: "#061014" }}>
            <span className="block text-lg font-black uppercase">{pad.id}</span>
            <span className="block truncate text-[10px] font-black uppercase opacity-75">{pad.soundName || pad.role}</span>
            <span className="mt-2 block text-[9px] font-black uppercase opacity-60">Notes {notes.filter((note) => note.padId === pad.id).length}</span>
          </button>)}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[.035] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="mr-auto text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">MIDI note grid for {selectedPad.id}</p>
            <button onClick={selectPadNotes} className="rounded-lg border border-cyan-300/25 px-2 py-1 text-[10px] uppercase text-cyan-100">Select Pad Notes</button>
            <button onClick={clearSelection} className="rounded-lg border border-white/10 px-2 py-1 text-[10px] uppercase text-white/60">Clear Selection</button>
            <button onClick={duplicateSelected} className="rounded-lg border border-green-300/25 px-2 py-1 text-[10px] uppercase text-green-100">Duplicate</button>
          </div>
          <div className="grid grid-cols-8 gap-1 lg:grid-cols-16">{Array.from({ length: 16 }, (_, step) => { const note = notes.find((item) => item.padId === selectedPad.id && item.step === step); return <button key={step} onClick={(event) => toggleNote(step, event.metaKey || event.ctrlKey || event.shiftKey)} className={`h-10 rounded-lg border text-[10px] font-black ${note?.selected ? "border-pink-300 bg-pink-300/70 text-black" : note ? "border-green-300 bg-green-300/40 text-black" : "border-white/10 bg-black/35 text-white/35"}`}>{step + 1}</button>; })}</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">{padNotes.map((note) => <div key={note.id} className={`rounded-lg border p-2 ${note.selected ? "border-pink-300/50 bg-pink-300/10" : "border-white/10 bg-black/40"}`}><div className="mb-2 flex items-center gap-2"><b className="mr-auto text-[10px] uppercase text-white/70">Step {note.step + 1}</b><button onClick={() => setNotes((current) => current.map((item) => item.id === note.id ? { ...item, selected: !item.selected } : item))} className="rounded border border-white/10 px-2 py-1 text-[9px] uppercase text-white/60">{note.selected ? "Selected" : "Select"}</button><button onClick={() => commitNotes(notes.filter((item) => item.id !== note.id), `Erased MIDI note on step ${note.step + 1}.`)} className="rounded border border-red-300/25 px-2 py-1 text-[9px] uppercase text-red-100">Erase</button></div><Range label={`Length ${note.length}`} min={1} max={16} value={note.length} onChange={(value) => updateNote(note.id, { length: value })} /><Range label={`Velocity ${note.velocity}`} min={1} max={127} value={note.velocity} onChange={(value) => updateNote(note.id, { velocity: value })} /></div>)}</div>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-2xl border border-yellow-300/20 bg-black/45 p-3"><p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-yellow-200/70">Selected pad controls</p><div className="mb-2 flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-lg font-black text-black" style={{ background: selectedPad.color }}>{selectedPad.id}</span><div className="min-w-0"><b className="block truncate text-sm uppercase text-white">{selectedPad.name}</b><span className="block truncate text-[10px] uppercase text-white/45">{selectedPad.soundName || "Drop/upload a sound"}</span></div></div><Range label={`Tune ${selectedPad.tune} semis`} min={-24} max={24} value={selectedPad.tune} onChange={(value) => updateSelectedPad({ tune: value })} /><Range label={`Gain ${Math.round(selectedPad.gain * 100)}%`} min={0} max={150} value={Math.round(selectedPad.gain * 100)} onChange={(value) => updateSelectedPad({ gain: value / 100 })} /><Range label={`Pan ${selectedPad.pan}`} min={-50} max={50} value={selectedPad.pan} onChange={(value) => updateSelectedPad({ pan: value })} /><div className="grid grid-cols-2 gap-2"><button onClick={() => updateSelectedPad({ reverse: !selectedPad.reverse })} className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase ${selectedPad.reverse ? "border-pink-300 bg-pink-300/10 text-pink-100" : "border-white/10 text-white/45"}`}>Reverse</button><select value={selectedPad.chokeGroup} onChange={(event) => updateSelectedPad({ chokeGroup: event.target.value })} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] uppercase"><option value="none">No choke</option><option value="hats">Hats</option><option value="chops">Chops</option><option value="808">808</option><option value="custom-a">Custom A</option></select></div></div>
        <div className="rounded-2xl border border-green-300/20 bg-black/45 p-3"><div className="mb-2 flex items-center gap-2"><p className="mr-auto text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Cloud My Sounds</p><button onClick={() => void refreshMySounds()} className="rounded-lg border border-green-300/30 px-2 py-1 text-[10px] uppercase text-green-100">Refresh</button></div><div className="grid max-h-72 gap-2 overflow-y-auto pr-1">{mySounds.length === 0 && <p className="text-sm text-white/45">Upload or refresh sounds to drag them onto pads.</p>}{mySounds.slice(0, 40).map((sound) => <button key={`${sound.id}-${sound.url}`} draggable onDragStart={(event) => padDragStart(sound, event)} onClick={() => assignSoundToPad(sound)} className="rounded-lg border border-white/10 bg-white/[.035] p-2 text-left"><b className="block truncate text-xs uppercase text-green-100">{sound.name}</b><span className="text-[10px] uppercase text-white/40">{sound.instrument || sound.source || "sound"}</span></button>)}</div></div>
        <div className="rounded-2xl border border-pink-300/20 bg-black/45 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-pink-200/70">MIDI arrangement</p><Range label={`Bars ${arrangementBars}`} min={1} max={64} value={arrangementBars} onChange={setArrangementBars} /><button onClick={() => downloadJson("ems-midi-smart-mpc-kit-local.json", kitSnapshot)} className="w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs font-black uppercase text-white/70">Download Kit Snapshot</button><div className="mt-2 text-[10px] uppercase text-white/45">Undo stack: {undoStack.length} · Redo stack: {redoStack.length} · Selected notes: {selectedNotes.length}</div></div>
      </aside>
    </section>
    <BeatMachineProClient />
  </div>;
}

function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return <label className="mb-2 block"><span className="text-[10px] font-black uppercase text-white/45">{label}</span><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>;
}
