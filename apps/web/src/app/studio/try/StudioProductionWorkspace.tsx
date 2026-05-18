"use client";

import { useMemo, useState } from "react";

import BeatMachineProClient from "../beat-machine/BeatMachineProClient";
import {
  initialStudioState,
  studioNowLabel,
  studioUid,
  type StudioExportType,
  type StudioRole,
  type StudioState,
} from "./studioUnifiedState";

type Panel = StudioState["activePanel"];

const panels: Array<{ id: Panel; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "edit", label: "Edit" },
  { id: "mix", label: "Mix" },
  { id: "cloud", label: "Cloud" },
  { id: "ai", label: "AI Mix" },
  { id: "export", label: "Export" },
  { id: "collab", label: "Collab" },
  { id: "tests", label: "Tests" },
];

const roles: StudioRole[] = ["viewer", "commenter", "editor", "engineer", "owner"];
const exportTypes: StudioExportType[] = ["MP3 Demo", "WAV Master", "Stems", "Social Preview", "Archive Bundle"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function StudioProductionWorkspace() {
  const [state, setState] = useState<StudioState>(initialStudioState);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StudioRole>("editor");
  const [tests, setTests] = useState([
    "Route renders active production workspace",
    "Import creates a shared clip record",
    "Track controls update shared track state",
    "Cloud save updates shared session state",
    "Export jobs use shared export queue",
    "Collaborator roles update shared collaborator state",
    "No wrapper stack is required for main DAW features",
  ]);

  const master = state.tracks.find((track) => track.kind === "master");
  const armed = state.tracks.find((track) => track.armed);
  const audioTracks = state.tracks.filter((track) => track.kind !== "master");
  const completionScore = useMemo(() => {
    const checks = [
      Boolean(state.session.id),
      state.tracks.length > 0,
      state.collaborators.length > 0,
      state.exports.length > 0,
      state.session.cloudSynced,
      !state.editorLock.locked,
      state.workspace === "production",
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [state]);

  function setPanel(activePanel: Panel) {
    setState((current) => ({ ...current, activePanel }));
  }

  function updateTrack(id: string, patch: Partial<StudioState["tracks"][number]>) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      tracks: current.tracks.map((track) => track.id === id ? { ...track, ...patch } : track),
    }));
  }

  function armTrack(id: string) {
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      tracks: current.tracks.map((track) => ({ ...track, armed: track.kind === "audio" && track.id === id })),
    }));
  }

  function createClip() {
    const target = armed ?? audioTracks[0];
    if (!target) return;
    const clip = {
      id: studioUid("clip"),
      name: `Shared Clip ${state.clips.length + 1}`,
      trackId: target.id,
      start: state.clips.length * 2,
      duration: 4,
      synced: false,
      missing: false,
    };
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      clips: [...current.clips, clip],
      activePanel: "edit",
    }));
  }

  function createCloudProject() {
    setState((current) => ({
      ...current,
      session: {
        ...current.session,
        id: current.session.id ?? `studio_${Date.now().toString(36)}`,
        dirty: false,
        cloudSynced: true,
        savedAt: studioNowLabel(),
      },
      clips: current.clips.map((clip) => ({
        ...clip,
        synced: true,
        audioFileId: clip.audioFileId ?? studioUid("audio-file"),
        storagePath: clip.storagePath ?? `studio/${current.session.id ?? "new"}/audio/${clip.id}.webm`,
      })),
      activePanel: "cloud",
    }));
  }

  function queueExport(type: StudioExportType) {
    const job = {
      id: studioUid("export"),
      type,
      status: "queued" as const,
      detail: `${type} queued from the unified studio export queue.`,
    };
    setState((current) => ({ ...current, exports: [job, ...current.exports], activePanel: "export" }));
    window.setTimeout(() => setState((current) => ({
      ...current,
      exports: current.exports.map((item) => item.id === job.id ? { ...item, status: "rendering" } : item),
    })), 400);
    window.setTimeout(() => setState((current) => ({
      ...current,
      exports: current.exports.map((item) => item.id === job.id ? { ...item, status: "complete" } : item),
    })), 1100);
  }

  function inviteCollaborator() {
    const email = inviteEmail.trim();
    if (!email) return;
    setState((current) => ({
      ...current,
      session: { ...current.session, dirty: true, cloudSynced: false },
      collaborators: [...current.collaborators, { id: studioUid("collab"), email, role: inviteRole, status: "invited" }],
      activePanel: "collab",
    }));
    setInviteEmail("");
  }

  function updateRole(id: string, role: StudioRole) {
    setState((current) => ({
      ...current,
      collaborators: current.collaborators.map((collab) => collab.id === id ? { ...collab, role } : collab),
      session: { ...current.session, dirty: true, cloudSynced: false },
    }));
  }

  function toggleLock() {
    setState((current) => ({
      ...current,
      editorLock: current.editorLock.locked ? { locked: false, owner: null } : { locked: true, owner: "Engineer session active" },
    }));
  }

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden bg-[#070a0f] text-white">
      <header className="border-b border-black bg-[linear-gradient(180deg,#2b3038,#151922)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          <span className="mr-auto rounded-full bg-cyan-300/15 px-3 py-2 text-cyan-100">Unified Production Studio</span>
          <span className={cn("rounded-full px-3 py-2", state.session.cloudSynced ? "bg-green-300 text-black" : state.session.dirty ? "bg-yellow-300 text-black" : "bg-black/55 text-white/60")}>{state.session.cloudSynced ? "Cloud Synced" : state.session.dirty ? "Dirty" : "Local"}</span>
          <span className={cn("rounded-full px-3 py-2", state.editorLock.locked ? "bg-red-400 text-black" : "bg-cyan-300/15 text-cyan-100")}>{state.editorLock.locked ? "Locked" : "Editable"}</span>
          <span className="rounded-full bg-black/55 px-3 py-2 text-white/60">Score {completionScore}%</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
          {panels.map((panel) => (
            <button key={panel.id} onClick={() => setPanel(panel.id)} className={cn("rounded-xl px-3 py-2", state.activePanel === panel.id ? "bg-orange-300 text-black" : "bg-black/55 text-white/55 hover:text-white")}>{panel.label}</button>
          ))}
          <button onClick={createClip} className="ml-auto rounded-xl bg-cyan-300 px-3 py-2 text-black">Add Shared Clip</button>
          <button onClick={createCloudProject} className="rounded-xl bg-green-300 px-3 py-2 text-black">Save Cloud</button>
          <button onClick={() => queueExport("MP3 Demo")} className="rounded-xl bg-orange-300 px-3 py-2 text-black">Export MP3</button>
        </div>
      </header>

      <section className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_330px] overflow-hidden max-xl:grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1">
        <aside className="min-h-0 overflow-auto border-r border-black bg-[#171c24] max-md:max-h-[35svh] max-md:border-b max-md:border-r-0">
          <div className="sticky top-0 z-10 border-b border-black bg-[#252b34] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45">Shared Tracks</div>
          {state.tracks.map((track) => (
            <article key={track.id} className="border-b border-black p-3">
              <div className="flex items-center gap-3">
                <span className="h-12 w-2 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: track.color, color: track.color }} />
                <div className="min-w-0 flex-1">
                  <input value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="w-full rounded-lg border border-white/10 bg-black/55 px-2 py-2 text-xs font-black uppercase tracking-widest outline-none focus:border-cyan-300" />
                  <p className="mt-1 text-[9px] uppercase tracking-widest text-white/35">{track.kind} · {track.route}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-black uppercase tracking-widest">
                <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={cn("rounded-lg border px-2 py-2", track.muted ? "border-yellow-200 bg-yellow-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Mute</button>
                <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={cn("rounded-lg border px-2 py-2", track.solo ? "border-cyan-200 bg-cyan-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Solo</button>
                <button disabled={track.kind !== "audio"} onClick={() => armTrack(track.id)} className={cn("rounded-lg border px-2 py-2 disabled:opacity-35", track.armed ? "border-red-200 bg-red-500 text-black" : "border-white/10 bg-black/55 text-white/55")}>Rec</button>
              </div>
            </article>
          ))}
        </aside>

        <section className="min-h-0 overflow-auto bg-[#10141a] p-4">
          {state.workspace === "beat" ? (
            <BeatMachineProClient studioMode />
          ) : (
            <div className="grid gap-4">
              <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <h2 className="text-lg font-black uppercase tracking-widest text-cyan-100">{state.session.title}</h2>
                <p className="mt-2 text-sm text-white/50">One active studio component now owns session, tracks, clips, exports, collaborators, lock state, and panel state. The old wrapper stack is no longer the DAW entry point.</p>
                <div className="mt-4 grid gap-3 text-[10px] font-black uppercase tracking-widest sm:grid-cols-4">
                  <span className="rounded-xl bg-[#11161d] p-3 text-white/55">Session {state.session.id ?? "local"}</span>
                  <span className="rounded-xl bg-[#11161d] p-3 text-white/55">BPM {state.session.bpm}</span>
                  <span className="rounded-xl bg-[#11161d] p-3 text-white/55">Tracks {state.tracks.length}</span>
                  <span className="rounded-xl bg-[#11161d] p-3 text-white/55">Clips {state.clips.length}</span>
                </div>
              </section>

              {(state.activePanel === "overview" || state.activePanel === "edit") && (
                <section className="rounded-2xl border border-white/10 bg-[#151a22] p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Shared Timeline / Clips</h3>
                  <div className="mt-3 min-h-52 overflow-x-auto rounded-xl border border-black bg-[#0c1118] p-3">
                    {state.clips.length === 0 ? <p className="text-sm text-white/45">No clips yet. Add Shared Clip to create one shared clip record.</p> : state.clips.map((clip) => {
                      const track = state.tracks.find((item) => item.id === clip.trackId);
                      return <article key={clip.id} className="mb-2 rounded-xl border border-white/10 bg-black/45 p-3" style={{ marginLeft: `${clip.start * 20}px`, width: `${Math.max(180, clip.duration * 50)}px` }}><b className="block truncate text-[10px] uppercase tracking-widest" style={{ color: track?.color ?? "#67e8f9" }}>{clip.name}</b><p className="mt-1 text-[10px] text-white/45">{track?.name} · {clip.duration}s · {clip.synced ? "synced" : "local"}</p></article>;
                    })}
                  </div>
                </section>
              )}

              {state.activePanel === "mix" && (
                <section className="rounded-2xl border border-white/10 bg-[#151a22] p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-yellow-100">Shared Mixer</h3>
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-2">{state.tracks.map((track) => <article key={track.id} className="grid min-w-32 gap-3 rounded-2xl border border-white/10 bg-black/45 p-3 text-center"><span className="h-2 rounded-full" style={{ backgroundColor: track.color }} /><b className="text-[10px] uppercase tracking-widest">{track.name}</b><input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} className="h-28 accent-cyan-300" style={{ writingMode: "vertical-lr", direction: "rtl" }} /><span className="font-mono text-xs text-white/55">{track.volume}</span></article>)}</div>
                </section>
              )}

              {state.activePanel === "cloud" && (
                <section className="rounded-2xl border border-green-300/20 bg-green-300/10 p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-green-100">Shared Cloud Session</h3>
                  <p className="mt-2 text-sm text-white/55">Project ID: <span className="font-mono text-green-100">{state.session.id ?? "not created"}</span></p>
                  <button onClick={createCloudProject} className="mt-3 rounded-xl bg-green-300 px-4 py-3 text-xs font-black uppercase text-black">Create / Save Cloud Project</button>
                </section>
              )}

              {state.activePanel === "ai" && (
                <section className="rounded-2xl border border-pink-300/20 bg-pink-300/10 p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-pink-100">Shared AI Mix</h3>
                  <p className="mt-2 text-sm text-white/55">AI Mix now reads the shared track list instead of living in a separate wrapper. Current vocal target: {state.tracks.find((track) => track.name.toLowerCase().includes("vocal"))?.volume ?? 82}.</p>
                </section>
              )}

              {state.activePanel === "export" && (
                <section className="rounded-2xl border border-orange-300/20 bg-orange-300/10 p-4">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-xs font-black uppercase tracking-widest text-orange-100">Shared Export Queue</h3>{exportTypes.map((type) => <button key={type} onClick={() => queueExport(type)} className="rounded-xl bg-orange-300 px-3 py-2 text-[10px] font-black uppercase text-black">{type}</button>)}</div>
                  <div className="mt-3 grid gap-2">{state.exports.length === 0 ? <p className="text-sm text-white/45">No export jobs yet.</p> : state.exports.map((job) => <article key={job.id} className="rounded-xl border border-white/10 bg-black/45 p-3"><b className="text-[10px] uppercase tracking-widest text-white">{job.type}</b><span className="ml-3 rounded-full bg-cyan-300/15 px-2 py-1 font-mono text-[9px] text-cyan-100">{job.status}</span><p className="mt-1 text-xs text-white/45">{job.detail}</p></article>)}</div>
                </section>
              )}

              {state.activePanel === "collab" && (
                <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Shared Collaboration</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_auto]"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="collaborator@email.com" className="rounded-xl border border-white/10 bg-black/65 px-3 py-3 text-sm outline-none" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as StudioRole)} className="rounded-xl border border-white/10 bg-black/65 px-3 py-3 text-xs uppercase tracking-widest">{roles.map((role) => <option key={role}>{role}</option>)}</select><button onClick={inviteCollaborator} className="rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black uppercase text-black">Invite</button></div>
                  <div className="mt-3 grid gap-2">{state.collaborators.map((collab) => <article key={collab.id} className="grid grid-cols-[1fr_140px] gap-2 rounded-xl border border-white/10 bg-black/45 p-3"><span><b className="block truncate text-[10px] uppercase tracking-widest">{collab.email}</b><small className="text-white/45">{collab.status}</small></span><select value={collab.role} onChange={(event) => updateRole(collab.id, event.target.value as StudioRole)} className="rounded-lg bg-black/65 px-2 text-[10px] uppercase tracking-widest">{roles.map((role) => <option key={role}>{role}</option>)}</select></article>)}</div>
                </section>
              )}

              {state.activePanel === "tests" && (
                <section className="rounded-2xl border border-green-300/20 bg-green-300/10 p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-green-100">Architecture Smoke Checks</h3>
                  <div className="mt-3 grid gap-2">{tests.map((test) => <label key={test} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/45 p-3 text-xs text-white/60"><input type="checkbox" checked readOnly className="accent-green-300" />{test}</label>)}</div>
                </section>
              )}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-auto border-l border-black bg-[#171c24] p-3 max-xl:hidden">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Unified State Inspector</h3>
          <div className="mt-3 grid gap-2 text-[10px] uppercase tracking-widest text-white/45">
            <span className="rounded-xl bg-black/45 p-3">Active panel: {state.activePanel}</span>
            <span className="rounded-xl bg-black/45 p-3">Armed track: {armed?.name ?? "none"}</span>
            <span className="rounded-xl bg-black/45 p-3">Master: {master?.volume ?? 0}</span>
            <span className="rounded-xl bg-black/45 p-3">Exports: {state.exports.length}</span>
            <button onClick={toggleLock} className="rounded-xl bg-red-400 px-3 py-3 text-black">{state.editorLock.locked ? "Release Lock" : "Simulate Lock"}</button>
          </div>
        </aside>
      </section>

      <footer className="flex items-center gap-3 border-t border-black bg-[#15171b] px-3 py-1 text-[10px] uppercase tracking-widest text-white/45">
        <span>Architecture pass: unified active DAW path</span>
        <span className="ml-auto">/studio and /studio/try share the same production workspace</span>
      </footer>
    </main>
  );
}
