"use client";

import { useMemo, useState } from "react";
import BeatMachineProClient from "../beat-machine/BeatMachineProClient";

type StudioMode = "edit" | "beat" | "mix" | "export";
type ExportPresetId = "mp3-demo" | "wav-master" | "stems" | "social-preview";
type CollaboratorRole = "viewer" | "commenter" | "editor" | "engineer" | "owner";

type Track = {
  id: string;
  name: string;
  color: string;
  height: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  volume: number;
  inputGain: number;
  clips: { id: string; start: number; width: number; label: string }[];
};

type Invite = {
  id: string;
  email: string;
  role: CollaboratorRole;
  link: string;
};

type ExportPreset = {
  id: ExportPresetId;
  label: string;
  extension: string;
  description: string;
  format: string;
};

const exportPresets: ExportPreset[] = [
  { id: "mp3-demo", label: "MP3 demo", extension: "mp3", format: "192 kbps MP3", description: "Fast review copy for text, email, and quick approval." },
  { id: "wav-master", label: "WAV master", extension: "wav", format: "24-bit WAV", description: "Full-quality master handoff for release prep." },
  { id: "stems", label: "Stems", extension: "zip", format: "ZIP stems", description: "Separate track files for engineers and remixers." },
  { id: "social-preview", label: "Social preview", extension: "mp4", format: "15s MP4", description: "Short loudness-safe preview for reels and stories." },
];

const collaboratorRoles: { id: CollaboratorRole; label: string; description: string }[] = [
  { id: "viewer", label: "Viewer", description: "Can play the session only." },
  { id: "commenter", label: "Commenter", description: "Can leave timestamp notes." },
  { id: "editor", label: "Editor", description: "Can move clips and change settings." },
  { id: "engineer", label: "Engineer", description: "Can mix, export, and manage takes." },
  { id: "owner", label: "Owner", description: "Full control including sharing and roles." },
];

const initialTracks: Track[] = [
  { id: "vox", name: "Lead Vox", color: "#ff31df", height: 74, muted: false, solo: false, armed: true, volume: 78, inputGain: 72, clips: [{ id: "vox-1", start: 7, width: 18, label: "Lead_Vox_01" }, { id: "vox-2", start: 38, width: 21, label: "Hook_Double" }] },
  { id: "beat", name: "Beat Machine", color: "#20f7ff", height: 70, muted: false, solo: false, armed: false, volume: 82, inputGain: 58, clips: [{ id: "beat-1", start: 0, width: 28, label: "EMS_Beat_A" }, { id: "beat-2", start: 31, width: 28, label: "EMS_Beat_B" }] },
  { id: "bass", name: "808 Bass", color: "#f2c85b", height: 62, muted: false, solo: false, armed: false, volume: 76, inputGain: 66, clips: [{ id: "bass-1", start: 0, width: 22, label: "808_Sub" }, { id: "bass-2", start: 34, width: 18, label: "808_Fill" }] },
  { id: "keys", name: "Keys", color: "#16e59a", height: 62, muted: false, solo: false, armed: false, volume: 64, inputGain: 55, clips: [{ id: "keys-1", start: 14, width: 34, label: "Keys_Chords" }] },
  { id: "fx", name: "FX / Risers", color: "#a75cff", height: 54, muted: false, solo: false, armed: false, volume: 48, inputGain: 44, clips: [{ id: "fx-1", start: 54, width: 11, label: "Riser" }] },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-session";
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function makeSessionLink(seed: string) {
  const base = typeof window === "undefined" ? "https://www.epicmusicspace.com" : window.location.origin;
  return `${base}/studio/try?session=${encodeURIComponent(seed)}&access=private`;
}

function NavButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] transition",
        active ? "border-cyan-300 bg-cyan-300 text-black shadow-[0_0_24px_rgba(32,247,255,.38)]" : "border-white/12 bg-white/[0.04] text-white/62 hover:border-cyan-300/50 hover:text-cyan-100",
      )}
    >
      {children}
    </button>
  );
}

export default function ElectricStudio() {
  const [mode, setMode] = useState<StudioMode>("edit");
  const [tracks, setTracks] = useState(initialTracks);
  const [selectedTrack, setSelectedTrack] = useState("vox");
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [countInBars, setCountInBars] = useState(1);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const selected = tracks.find((track) => track.id === selectedTrack) ?? tracks[0];
  const armedTracks = tracks.filter((track) => track.armed);
  const recordTarget = armedTracks[0] ?? selected;

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((current) => current.map((track) => (track.id === id ? { ...track, ...patch } : track)));
  }

  function armTrackForRecording(id: string) {
    setTracks((current) => current.map((track) => ({ ...track, armed: track.id === id })));
    setSelectedTrack(id);
  }

  function generateShareLink() {
    const seed = `${slugify(selected.name)}-${Date.now().toString(36)}`;
    const link = makeSessionLink(seed);
    setShareLink(link);
    setCopiedShareLink(false);
    return link;
  }

  async function copyShareLink() {
    const link = shareLink ?? generateShareLink();
    await navigator.clipboard?.writeText(link);
    setCopiedShareLink(true);
  }

  function addInvite(email: string, role: CollaboratorRole) {
    const cleanEmail = email.trim();
    if (!cleanEmail) return;
    const seed = `${slugify(cleanEmail)}-${Date.now().toString(36)}`;
    const invite: Invite = { id: seed, email: cleanEmail, role, link: makeSessionLink(seed) };
    setInvites((current) => [invite, ...current].slice(0, 6));
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#05070a] text-white">
      <div className="flex h-full flex-col gap-2 p-2">
        <header className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-white/12 bg-[#11161c]/95 p-2 shadow-[0_0_30px_rgba(0,0,0,.35)]">
          <button onClick={() => setMode("edit")} className="rounded-xl border border-white/12 bg-black/35 px-4 py-2 text-left">
            <span className="block text-xl font-black tracking-tight text-cyan-300">EMS Studio</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">Pro edit + beat machine</span>
          </button>
          <nav className="flex flex-wrap gap-2">
            <NavButton active={mode === "edit"} onClick={() => setMode("edit")}>Edit</NavButton>
            <NavButton active={mode === "beat"} onClick={() => setMode("beat")}>Beat Machine</NavButton>
            <NavButton active={mode === "mix"} onClick={() => setMode("mix")}>Mix</NavButton>
            <NavButton active={mode === "export"} onClick={() => setMode("export")}>Export</NavButton>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/35 px-3 py-2">
            <button onClick={() => setPlaying(!playing)} className={cn("rounded-full px-4 py-2 text-[11px] font-black uppercase", playing ? "bg-red-400 text-black" : "bg-green-400 text-black")}>{playing ? "Stop" : "Play"}</button>
            <button onClick={() => setMetronomeEnabled((value) => !value)} className={cn("rounded-full border px-3 py-2 text-[10px] font-black uppercase", metronomeEnabled ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/45")}>Metro {metronomeEnabled ? "On" : "Off"}</button>
            <label className="text-[10px] uppercase text-white/45">Count-in <select value={countInBars} onChange={(event) => setCountInBars(Number(event.target.value))} className="ml-2 rounded bg-black px-2 py-1 text-cyan-200 outline-none"><option value={0}>Off</option><option value={1}>1 bar</option><option value={2}>2 bars</option><option value={4}>4 bars</option></select></label>
            <label className="text-[10px] uppercase text-white/45">BPM <input value={bpm} onChange={(event) => setBpm(Number(event.target.value) || 92)} className="ml-2 w-16 rounded bg-black px-2 py-1 text-cyan-200 outline-none" /></label>
            <span className="rounded-full border border-red-400/35 bg-red-400/10 px-3 py-2 text-[10px] font-black uppercase text-red-100">Rec target: {recordTarget.name}</span>
            <button onClick={() => setMode("beat")} className="rounded-full border border-cyan-300/45 bg-cyan-300/10 px-4 py-2 text-[11px] font-black uppercase text-cyan-100">Open Beat Machine</button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/12 bg-[#090d11]">
          {mode === "beat" && <BeatMachineProClient studioMode />}
          {mode === "edit" && <ProToolsEdit tracks={tracks} selectedTrack={selectedTrack} setSelectedTrack={setSelectedTrack} updateTrack={updateTrack} armTrackForRecording={armTrackForRecording} playing={playing} bpm={bpm} metronomeEnabled={metronomeEnabled} countInBars={countInBars} openBeatMachine={() => setMode("beat")} shareLink={shareLink} copiedShareLink={copiedShareLink} generateShareLink={generateShareLink} copyShareLink={copyShareLink} addInvite={addInvite} invites={invites} />}
          {mode === "mix" && <MixView tracks={tracks} selected={selected} updateTrack={updateTrack} />}
          {mode === "export" && <ExportView tracks={tracks} shareLink={shareLink} generateShareLink={generateShareLink} copyShareLink={copyShareLink} copiedShareLink={copiedShareLink} />}
        </main>
      </div>
    </div>
  );
}

function ProToolsEdit({ tracks, selectedTrack, setSelectedTrack, updateTrack, armTrackForRecording, playing, bpm, metronomeEnabled, countInBars, openBeatMachine, shareLink, copiedShareLink, generateShareLink, copyShareLink, addInvite, invites }: { tracks: Track[]; selectedTrack: string; setSelectedTrack: (id: string) => void; updateTrack: (id: string, patch: Partial<Track>) => void; armTrackForRecording: (id: string) => void; playing: boolean; bpm: number; metronomeEnabled: boolean; countInBars: number; openBeatMachine: () => void; shareLink: string | null; copiedShareLink: boolean; generateShareLink: () => string; copyShareLink: () => Promise<void>; addInvite: (email: string, role: CollaboratorRole) => void; invites: Invite[] }) {
  const bars = useMemo(() => Array.from({ length: 17 }, (_, i) => i + 1), []);
  const armedTrack = tracks.find((track) => track.armed) ?? tracks.find((track) => track.id === selectedTrack) ?? tracks[0];
  return (
    <div className="grid h-full min-h-0 grid-rows-[44px_1fr] overflow-hidden bg-[#101418]">
      <div className="grid grid-cols-[230px_1fr_360px] border-b border-white/10 bg-[#151a20] text-[10px] font-black uppercase tracking-[0.14em] text-white/52">
        <div className="flex items-center gap-2 border-r border-white/10 px-3"><span className={cn("h-2 w-2 rounded-full", playing ? "bg-green-400" : "bg-white/25")} /> Edit Window</div>
        <div className="flex items-center overflow-hidden px-2">{bars.map((bar) => <span key={bar} className="min-w-[90px] border-l border-white/10 px-2 font-mono text-white/40">{bar}</span>)}</div>
        <div className="flex items-center justify-end gap-2 border-l border-white/10 px-3"><span>{bpm} BPM</span><span>{metronomeEnabled ? "Metro" : "No metro"}</span><span>{countInBars ? `${countInBars} bar in` : "No count"}</span><button onClick={openBeatMachine} className="rounded-full border border-cyan-300/45 bg-cyan-300/10 px-3 py-1 text-cyan-100">Beat Machine</button></div>
      </div>
      <div className="grid min-h-0 grid-cols-[230px_1fr_330px] overflow-hidden">
        <aside className="overflow-auto border-r border-white/10 bg-[#11161b]">
          <div className="border-b border-red-400/20 bg-red-400/10 p-3 text-[10px] font-black uppercase tracking-widest text-red-100">Recording to: {armedTrack.name}</div>
          {tracks.map((track) => {
            const clipScore = track.volume + track.inputGain;
            const clipping = clipScore >= 154;
            return (
              <button key={track.id} onClick={() => setSelectedTrack(track.id)} className={cn("flex w-full items-center gap-2 border-b border-white/8 p-3 text-left", selectedTrack === track.id && "bg-cyan-300/10", track.armed && "ring-1 ring-red-400/40")} style={{ height: track.height }}>
                <span className="h-8 w-1 rounded" style={{ backgroundColor: track.color }} />
                <span className="min-w-0 flex-1"><b className="block truncate text-xs uppercase text-white/82">{track.name}</b><span className="text-[10px] uppercase text-white/35">Vol {track.volume} · Gain {track.inputGain}</span>{clipping && <span className="mt-1 block text-[9px] font-black uppercase text-red-200">Clipping risk</span>}</span>
                <span className="flex gap-1">
                  <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.muted ? "bg-yellow-300 text-black" : "bg-white/8 text-white/40")}>M</span>
                  <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.solo ? "bg-cyan-300 text-black" : "bg-white/8 text-white/40")}>S</span>
                  <span className={cn("rounded px-1.5 py-1 text-[9px] font-black", track.armed ? "bg-red-400 text-black animate-pulse" : "bg-white/8 text-white/40")}>R</span>
                </span>
              </button>
            );
          })}
        </aside>
        <section className="relative overflow-auto bg-[#0d1116] bg-[linear-gradient(rgba(255,255,255,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.055)_1px,transparent_1px)] bg-[size:100%_54px,90px_100%]">
          <div className="absolute left-[360px] top-0 h-full w-px bg-cyan-300 shadow-[0_0_16px_#20f7ff]" />
          <div className="min-w-[1530px]">
            {tracks.map((track, row) => (
              <div key={track.id} className="relative border-b border-white/8" style={{ height: track.height }}>
                {track.armed && <div className="absolute inset-y-0 left-0 w-full border-y border-red-400/25 bg-red-400/[0.035]" />}
                {track.clips.map((clip) => (
                  <button key={clip.id} className="absolute top-2 h-[calc(100%-16px)] rounded-lg border px-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.18)]" style={{ left: `${clip.start * 9}px`, width: `${clip.width * 9}px`, borderColor: track.color, backgroundColor: `${track.color}22` }}>
                    <b className="block truncate text-[11px] uppercase" style={{ color: track.color }}>{clip.label}</b>
                    <WaveMini color={track.color} row={row} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
        <Inspector tracks={tracks} selectedTrack={selectedTrack} updateTrack={updateTrack} armTrackForRecording={armTrackForRecording} shareLink={shareLink} copiedShareLink={copiedShareLink} generateShareLink={generateShareLink} copyShareLink={copyShareLink} addInvite={addInvite} invites={invites} />
      </div>
    </div>
  );
}

function WaveMini({ color, row }: { color: string; row: number }) {
  return <div className="mt-2 flex h-7 items-center gap-[2px] overflow-hidden">{Array.from({ length: 40 }, (_, i) => <span key={i} className="w-1 rounded-full" style={{ height: `${6 + Math.abs(Math.sin(i * 0.55 + row)) * 20}px`, backgroundColor: color, opacity: 0.78 }} />)}</div>;
}

function Inspector({ tracks, selectedTrack, updateTrack, armTrackForRecording, shareLink, copiedShareLink, generateShareLink, copyShareLink, addInvite, invites }: { tracks: Track[]; selectedTrack: string; updateTrack: (id: string, patch: Partial<Track>) => void; armTrackForRecording: (id: string) => void; shareLink: string | null; copiedShareLink: boolean; generateShareLink: () => string; copyShareLink: () => Promise<void>; addInvite: (email: string, role: CollaboratorRole) => void; invites: Invite[] }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("commenter");
  const track = tracks.find((item) => item.id === selectedTrack) ?? tracks[0];
  const clipScore = track.volume + track.inputGain;
  const clipping = clipScore >= 154;
  const headroom = Math.max(-12, 12 - Math.round((clipScore - 100) / 4));

  function fixClipping() {
    updateTrack(track.id, { volume: Math.min(track.volume, 72), inputGain: Math.min(track.inputGain, 62) });
  }

  function calibrateInputGain() {
    const targetGain = Math.max(28, Math.min(78, 132 - track.volume));
    updateTrack(track.id, { inputGain: targetGain });
  }

  function submitInvite() {
    addInvite(inviteEmail, inviteRole);
    setInviteEmail("");
  }

  return (
    <aside className="overflow-auto border-l border-white/10 bg-[#11161b] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Inspector</p>
      <h2 className="mt-2 text-2xl font-black uppercase" style={{ color: track.color }}>{track.name}</h2>
      <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3">
        <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-widest text-red-100">{clipping ? "Clipping warning" : "Headroom safe"}</p><span className={cn("rounded-full px-2 py-1 text-[10px] font-black", clipping ? "bg-red-400 text-black" : "bg-green-400 text-black")}>{headroom} dB</span></div>
        <p className="mt-2 text-xs leading-5 text-white/58">{clipping ? "Volume plus input gain is too hot. Lowering both will protect the take from distortion." : "Input level is inside the safe recording zone."}</p>
        {clipping && <button type="button" onClick={fixClipping} className="mt-3 rounded-full bg-red-400 px-4 py-2 text-[10px] font-black uppercase text-black">Fix it</button>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={cn("rounded-lg border py-2 text-xs font-black", track.muted ? "border-yellow-300 bg-yellow-300 text-black" : "border-white/10 text-white/55")}>Mute</button>
        <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={cn("rounded-lg border py-2 text-xs font-black", track.solo ? "border-cyan-300 bg-cyan-300 text-black" : "border-white/10 text-white/55")}>Solo</button>
        <button onClick={() => armTrackForRecording(track.id)} className={cn("rounded-lg border py-2 text-xs font-black", track.armed ? "border-red-400 bg-red-400 text-black" : "border-white/10 text-white/55")}>{track.armed ? "Armed" : "Arm"}</button>
      </div>
      <label className="mt-5 block text-[10px] font-black uppercase text-white/45">Volume<input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="mt-2 w-full accent-cyan-300" /></label>
      <label className="mt-4 block text-[10px] font-black uppercase text-white/45">Input gain calibration <span className="float-right text-cyan-200">{track.inputGain}%</span><input type="range" min="0" max="100" value={track.inputGain} onChange={(e) => updateTrack(track.id, { inputGain: Number(e.target.value) })} className="mt-2 w-full accent-green-300" /></label>
      <button type="button" onClick={calibrateInputGain} className="mt-2 w-full rounded-lg border border-green-300/35 bg-green-300/10 px-3 py-2 text-[10px] font-black uppercase text-green-100">Calibrate input gain</button>
      <label className="mt-4 block text-[10px] font-black uppercase text-white/45">Track Height<input type="range" min="44" max="120" value={track.height} onChange={(e) => updateTrack(track.id, { height: Number(e.target.value) })} className="mt-2 w-full accent-pink-300" /></label>
      <div className="mt-5 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Private session link</p>
        <p className="mt-2 truncate rounded bg-black/40 p-2 text-[11px] text-white/55">{shareLink ?? "No private link generated yet."}</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={generateShareLink} className="rounded-lg border border-cyan-300/35 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Create link</button><button type="button" onClick={copyShareLink} className="rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-black uppercase text-black">{copiedShareLink ? "Copied" : "Copy"}</button></div>
      </div>
      <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/45">Invite collaborator</p>
        <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="email@artist.com" className="mt-3 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none focus:border-cyan-300" />
        <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as CollaboratorRole)} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none focus:border-cyan-300">{collaboratorRoles.map((role) => <option key={role.id} value={role.id}>{role.label} — {role.description}</option>)}</select>
        <button type="button" onClick={submitInvite} className="mt-3 w-full rounded-lg bg-pink-300 px-3 py-2 text-[10px] font-black uppercase text-black">Invite collaborator</button>
        <div className="mt-3 space-y-2">{invites.map((invite) => <div key={invite.id} className="rounded-lg border border-white/10 bg-white/[0.035] p-2"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs text-white/70">{invite.email}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] uppercase text-white/45">{invite.role}</span></div><p className="mt-1 truncate text-[10px] text-white/35">{invite.link}</p></div>)}</div>
      </div>
    </aside>
  );
}

function MixView({ tracks, selected, updateTrack }: { tracks: Track[]; selected: Track; updateTrack: (id: string, patch: Partial<Track>) => void }) {
  return <div className="h-full overflow-auto p-4"><div className="grid min-w-[900px] grid-cols-5 gap-3">{tracks.map((track) => { const clipping = track.volume + track.inputGain >= 154; return <div key={track.id} className={cn("rounded-2xl border bg-black/35 p-4", clipping ? "border-red-400/60" : "border-white/10")}><b className="block text-center text-xs uppercase" style={{ color: track.color }}>{track.name}</b>{clipping && <p className="mt-2 rounded bg-red-400/10 p-2 text-center text-[10px] font-black uppercase text-red-100">Clipping risk</p>}<div className="mt-5 flex h-72 items-end justify-center gap-3"><div className="relative h-full w-3 rounded bg-white/10"><span className="absolute bottom-0 left-0 right-0 rounded" style={{ height: `${track.volume}%`, backgroundColor: track.color }} /></div><input type="range" min="0" max="100" value={track.volume} onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })} className="h-72 w-14 accent-cyan-300 [writing-mode:vertical-lr]" /></div></div>; })}</div><p className="mt-4 text-xs uppercase text-white/35">Selected: {selected.name}</p></div>;
}

function ExportView({ tracks, shareLink, generateShareLink, copyShareLink, copiedShareLink }: { tracks: Track[]; shareLink: string | null; generateShareLink: () => string; copyShareLink: () => Promise<void>; copiedShareLink: boolean }) {
  const [sessionName, setSessionName] = useState("EMS Studio Session");
  const [selectedPreset, setSelectedPreset] = useState<ExportPresetId>("mp3-demo");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "exporting" | "complete">("idle");
  const preset = exportPresets.find((item) => item.id === selectedPreset) ?? exportPresets[0];
  const fileName = `${slugify(sessionName)}-${preset.id}-${todayStamp()}.${preset.extension}`;

  function exportPreset() {
    setStatus("exporting");
    setProgress(10);
    const steps = [35, 62, 84, 100];
    steps.forEach((step, index) => window.setTimeout(() => {
      setProgress(step);
      if (step === 100) {
        const payload = { sessionName, preset: preset.id, fileName, exportedAt: new Date().toISOString(), tracks };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName.replace(`.${preset.extension}`, ".json");
        a.click();
        URL.revokeObjectURL(url);
        setStatus("complete");
      }
    }, 350 * (index + 1)));
  }

  return <div className="h-full overflow-auto p-6"><div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-white/12 bg-black/40 p-6"><h2 className="text-3xl font-black uppercase text-cyan-200">Export Session</h2><p className="mt-3 text-sm text-white/55">Choose a release-ready preset, follow file naming rules, and watch export progress before download.</p><label className="mt-5 block text-[10px] font-black uppercase tracking-widest text-white/45">Session name<input value={sessionName} onChange={(event) => setSessionName(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-cyan-300" /></label><div className="mt-5 grid gap-3 sm:grid-cols-2">{exportPresets.map((item) => <button key={item.id} type="button" onClick={() => setSelectedPreset(item.id)} className={cn("rounded-xl border p-4 text-left", selectedPreset === item.id ? "border-cyan-300 bg-cyan-300/15" : "border-white/10 bg-white/[0.035]")}><b className="block text-sm uppercase text-white">{item.label}</b><span className="mt-1 block text-[10px] uppercase tracking-widest text-cyan-100">{item.format}</span><p className="mt-2 text-xs leading-5 text-white/50">{item.description}</p></button>)}</div><button onClick={exportPreset} disabled={status === "exporting"} className="mt-5 rounded-full bg-cyan-300 px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-50">{status === "exporting" ? "Exporting..." : `Export ${preset.label}`}</button>{status !== "idle" && <div className="mt-5 rounded-xl border border-white/10 bg-black/40 p-3"><div className="flex items-center justify-between text-[10px] font-black uppercase text-white/45"><span>Download progress</span><span>{progress}%</span></div><div className="mt-2 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${progress}%` }} /></div>{status === "complete" && <p className="mt-3 text-sm font-bold text-green-200">Export complete. Download started for {fileName.replace(`.${preset.extension}`, ".json")}.</p>}</div>}</section><aside className="space-y-4"><div className="rounded-2xl border border-white/12 bg-black/40 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-white/45">File naming rules</p><ul className="mt-3 space-y-2 text-sm leading-6 text-white/60"><li>Use lowercase letters, numbers, and dashes only.</li><li>Include preset name and export date automatically.</li><li>Keep names short enough for email and mobile downloads.</li><li>Current file: <span className="font-mono text-cyan-100">{fileName}</span></li></ul></div><div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Share private link</p><p className="mt-2 truncate rounded bg-black/40 p-2 text-[11px] text-white/55">{shareLink ?? "Generate a private session link for reviewers."}</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={generateShareLink} className="rounded-lg border border-cyan-300/35 px-3 py-2 text-[10px] font-black uppercase text-cyan-100">Create link</button><button type="button" onClick={copyShareLink} className="rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-black uppercase text-black">{copiedShareLink ? "Copied" : "Copy"}</button></div></div></aside></div></div>;
}
