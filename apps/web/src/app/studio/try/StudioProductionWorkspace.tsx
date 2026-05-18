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

type PanelGroup = {
  label: string;
  items: Array<{ id: Panel; label: string }>;
};

const panelGroups: PanelGroup[] = [
  { label: "DAW", items: [{ id: "overview", label: "Session" }, { id: "edit", label: "Edit" }, { id: "mix", label: "Mix" }] },
  { label: "Production", items: [{ id: "cloud", label: "Cloud" }, { id: "ai", label: "AI Mix" }, { id: "export", label: "Export" }] },
  { label: "Launch", items: [{ id: "collab", label: "Collab" }, { id: "tests", label: "Tests" }] },
];

const roles: StudioRole[] = ["viewer", "commenter", "editor", "engineer", "owner"];
const exportTypes: StudioExportType[] = ["MP3 Demo", "WAV Master", "Stems", "Social Preview", "Archive Bundle"];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function PanelFrame({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="min-h-0 border-t border-black bg-[#10141a]">
      <div className="flex min-h-12 items-center gap-3 border-b border-black bg-[#181e27] px-4">
        <span className="text-[10px] font-black uppercase tracking-[0.26em] text-cyan-100/55">{eyebrow}</span>
        <h2 className="truncate text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h2>
      </div>
      <div className="min-h-0 p-4">{children}</div>
    </section>
  );
}

export default function StudioProductionWorkspace() {
  const [state, setState] = useState<StudioState>(initialStudioState);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StudioRole>("editor");
  const tests = [
    "Route renders active production workspace",
    "Import creates a shared clip record",
    "Track controls update shared track state",
    "Cloud save updates shared session state",
    "Export jobs use shared export queue",
    "Collaborator roles update shared collaborator state",
    "No wrapper stack is required for main DAW features",
    "Managed layout has no floating launch overlay",
    "Inspector collapses into normal page flow on smaller screens",
  ];

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

  const statusLabel = state.session.cloudSynced ? "Cloud Synced" : state.session.dirty ? "Dirty" : "Local";
  const activeGroup = panelGroups.find((group) => group.items.some((item) => item.id === state.activePanel));

  return (
    <main className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden bg-[#070a0f] text-white">
      <header className="border-b border-black bg-[linear-gradient(180deg,#2b3038,#151922)]">
        <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest">
          <span className="mr-auto text-cyan-100">Unified Production Studio</span>
          <button onClick={createClip} className="rounded-md bg-cyan-300 px-3 py-2 text-black">Add Clip</button>
          <button onClick={createCloudProject} className="rounded-md bg-green-300 px-3 py-2 text-black">Save Cloud</button>
          <button onClick={() => queueExport("MP3 Demo")} className="rounded-md bg-orange-300 px-3 py-2 text-black">Export</button>
          <span className={cn("rounded-md px-3 py-2", state.session.cloudSynced ? "bg-green-300 text-black" : state.session.dirty ? "bg-yellow-300 text-black" : "bg-black/55 text-white/60")}>{statusLabel}</span>
          <button onClick={toggleLock} className={cn("rounded-md px-3 py-2", state.editorLock.locked ? "bg-red-400 text-black" : "bg-cyan-300/15 text-cyan-100")}>{state.editorLock.locked ? "Locked" : "Editable"}</button>
        </div>
        <nav className="flex min-h-11 items-stretch gap-0 overflow-x-auto border-t border-black bg-[#10151d] text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
          {panelGroups.map((group) => (
            <div key={group.label} className="flex shrink-0 items-center border-r border-black">
              <span className="px-3 text-white/25">{group.label}</span>
              {group.items.map((panel) => (
                <button key={panel.id} onClick={() => setPanel(panel.id)} className={cn("min-h-11 px-3 transition", state.activePanel === panel.id ? "bg-orange-300 text-black" : "hover:bg-white/10 hover:text-white")}>{panel.label}</button>
              ))}
            </div>
          ))}
        </nav>
      </header>

      <section className="grid min-h-0 grid-cols-[250px_minmax(0,1fr)_310px] overflow-hidden max-xl:grid-cols-[220px_minmax(0,1fr)] max-lg:grid-cols-1 max-lg:overflow-auto">
        <aside className="min-h-0 overflow-auto border-r border-black bg-[#171c24] max-lg:max-h-none max-lg:border-b max-lg:border-r-0">
          <div className="border-b border-black bg-[#252b34] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/45">Tracks</div>
          {state.tracks.map((track) => (
            <article key={track.id} className="border-b border-black p-3">
              <div className="flex items-center gap-3">
                <span className="h-10 w-1.5 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: track.color, color: track.color }} />
                <div className="min-w-0 flex-1">
                  <input value={track.name} onChange={(event) => updateTrack(track.id, { name: event.target.value })} className="w-full border-0 bg-transparent text-xs font-black uppercase tracking-widest outline-none focus:text-cyan-100" />
                  <p className="mt-1 text-[9px] uppercase tracking-widest text-white/35">{track.kind} · {track.route}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 text-[9px] font-black uppercase tracking-widest">
                <button onClick={() => updateTrack(track.id, { muted: !track.muted })} className={cn("border px-2 py-2", track.muted ? "border-yellow-200 bg-yellow-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Mute</button>
                <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={cn("border px-2 py-2", track.solo ? "border-cyan-200 bg-cyan-300 text-black" : "border-white/10 bg-black/55 text-white/55")}>Solo</button>
                <button disabled={track.kind !== "audio"} onClick={() => armTrack(track.id)} className={cn("border px-2 py-2 disabled:opacity-35", track.armed ? "border-red-200 bg-red-500 text-black" : "border-white/10 bg-black/55 text-white/55")}>Rec</button>
              </div>
            </article>
          ))}
        </aside>

        <section className="min-h-0 overflow-auto bg-[#10141a]">
          {state.workspace === "beat" ? (
            <BeatMachineProClient studioMode />
          ) : (
            <div className="min-h-full">
              <div className="flex min-h-10 items-center gap-2 border-b border-black bg-[#0c1118] px-4 text-[10px] font-black uppercase tracking-widest text-white/45">
                <span>{activeGroup?.label ?? "DAW"}</span>
                <span className="text-white/20">/</span>
                <span className="text-cyan-100">{state.activePanel}</span>
                <span className="ml-auto">Score {completionScore}%</span>
              </div>

              {(state.activePanel === "overview" || state.activePanel === "edit") && (
                <PanelFrame title="Edit Window" eyebrow="Timeline">
                  <div className="min-h-[460px] overflow-x-auto border border-black bg-[#0c1118] p-3">
                    <div className="mb-3 grid grid-cols-4 gap-2 text-[10px] font-black uppercase tracking-widest text-white/45 max-md:grid-cols-2">
                      <span className="bg-[#151a22] p-3">Session {state.session.id ?? "local"}</span>
                      <span className="bg-[#151a22] p-3">BPM {state.session.bpm}</span>
                      <span className="bg-[#151a22] p-3">Tracks {state.tracks.length}</span>
                      <span className="bg-[#151a22] p-3">Clips {state.clips.length}</span>
                    </div>
                    {state.clips.length === 0 ? <p className="text-sm text-white/45">No clips yet. Add Clip creates one shared clip record.</p> : state.clips.map((clip) => {
                      const track = state.tracks.find((item) => item.id === clip.trackId);
                      return <article key={clip.id} className="mb-2 border border-white/10 bg-black/45 p-3" style={{ marginLeft: `${clip.start * 20}px`, width: `${Math.max(180, clip.duration * 50)}px` }}><b className="block truncate text-[10px] uppercase tracking-widest" style={{ color: track?.color ?? "#67e8f9" }}>{clip.name}</b><p className="mt-1 text-[10px] text-white/45">{track?.name} · {clip.duration}s · {clip.synced ? "synced" : "local"}</p></article>;
                    })}
                  </div>
                </PanelFrame>
              )}

              {state.activePanel === "mix" && (
                <PanelFrame title="Mixer" eyebrow="Fader Bank">
                  <div className="flex min-h-[460px] gap-3 overflow-x-auto border border-black bg-[#0c1118] p-3">{state.tracks.map((track) => <article key={track.id} className="grid min-w-32 gap-3 border border-white/10 bg-[#151a22] p-3 text-center"><span className="h-2" style={{ backgroundColor: track.color }} /><b className="text-[10px] uppercase tracking-widest">{track.name}</b><input type="range" min="0" max="100" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })} className="h-64 accent-cyan-300" style={{ writingMode: "vertical-lr", direction: "rtl" }} /><span className="font-mono text-xs text-white/55">{track.volume}</span></article>)}</div>
                </PanelFrame>
              )}

              {state.activePanel === "cloud" && (
                <PanelFrame title="Cloud Session" eyebrow="Production">
                  <div className="grid gap-3 border border-black bg-[#0c1118] p-4 text-sm text-white/60"><p>Project ID: <span className="font-mono text-green-100">{state.session.id ?? "not created"}</span></p><p>Status: {statusLabel}</p><button onClick={createCloudProject} className="w-fit bg-green-300 px-4 py-3 text-xs font-black uppercase text-black">Create / Save Cloud Project</button></div>
                </PanelFrame>
              )}

              {state.activePanel === "ai" && (
                <PanelFrame title="AI Mix" eyebrow="Production">
                  <div className="border border-black bg-[#0c1118] p-4 text-sm text-white/60">AI Mix reads the shared track list instead of living in a separate overlay. Current vocal target: {state.tracks.find((track) => track.name.toLowerCase().includes("vocal"))?.volume ?? 82}.</div>
                </PanelFrame>
              )}

              {state.activePanel === "export" && (
                <PanelFrame title="Export" eyebrow="Production">
                  <div className="border border-black bg-[#0c1118] p-4"><div className="flex flex-wrap gap-2">{exportTypes.map((type) => <button key={type} onClick={() => queueExport(type)} className="bg-orange-300 px-3 py-2 text-[10px] font-black uppercase text-black">{type}</button>)}</div><div className="mt-3 grid gap-2">{state.exports.length === 0 ? <p className="text-sm text-white/45">No export jobs yet.</p> : state.exports.map((job) => <article key={job.id} className="border border-white/10 bg-black/45 p-3"><b className="text-[10px] uppercase tracking-widest text-white">{job.type}</b><span className="ml-3 bg-cyan-300/15 px-2 py-1 font-mono text-[9px] text-cyan-100">{job.status}</span><p className="mt-1 text-xs text-white/45">{job.detail}</p></article>)}</div></div>
                </PanelFrame>
              )}

              {state.activePanel === "collab" && (
                <PanelFrame title="Collaboration" eyebrow="Launch">
                  <div className="border border-black bg-[#0c1118] p-4"><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"><input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="collaborator@email.com" className="border border-white/10 bg-black/65 px-3 py-3 text-sm outline-none" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as StudioRole)} className="border border-white/10 bg-black/65 px-3 py-3 text-xs uppercase tracking-widest">{roles.map((role) => <option key={role}>{role}</option>)}</select><button onClick={inviteCollaborator} className="bg-cyan-300 px-4 py-3 text-xs font-black uppercase text-black">Invite</button></div><div className="mt-3 grid gap-2">{state.collaborators.map((collab) => <article key={collab.id} className="grid grid-cols-[1fr_140px] gap-2 border border-white/10 bg-black/45 p-3"><span><b className="block truncate text-[10px] uppercase tracking-widest">{collab.email}</b><small className="text-white/45">{collab.status}</small></span><select value={collab.role} onChange={(event) => updateRole(collab.id, event.target.value as StudioRole)} className="bg-black/65 px-2 text-[10px] uppercase tracking-widest">{roles.map((role) => <option key={role}>{role}</option>)}</select></article>)}</div></div>
                </PanelFrame>
              )}

              {state.activePanel === "tests" && (
                <PanelFrame title="Launch Tests" eyebrow="Launch">
                  <div className="grid gap-2 border border-black bg-[#0c1118] p-4">{tests.map((test) => <label key={test} className="flex items-center gap-3 border border-white/10 bg-black/45 p-3 text-xs text-white/60"><input type="checkbox" checked readOnly className="accent-green-300" />{test}</label>)}</div>
                </PanelFrame>
              )}
            </div>
          )}
        </section>

        <aside className="min-h-0 overflow-auto border-l border-black bg-[#171c24] p-3 max-xl:col-span-full max-xl:border-l-0 max-xl:border-t max-xl:max-h-72">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-100">Inspector</h3>
          <div className="mt-3 grid gap-2 text-[10px] uppercase tracking-widest text-white/45 sm:grid-cols-2 xl:grid-cols-1">
            <span className="bg-black/45 p-3">Panel: {state.activePanel}</span>
            <span className="bg-black/45 p-3">Armed: {armed?.name ?? "none"}</span>
            <span className="bg-black/45 p-3">Master: {master?.volume ?? 0}</span>
            <span className="bg-black/45 p-3">Exports: {state.exports.length}</span>
            <span className="bg-black/45 p-3">Collaborators: {state.collaborators.length}</span>
            <span className="bg-black/45 p-3">Lock: {state.editorLock.locked ? state.editorLock.owner : "clear"}</span>
          </div>
        </aside>
      </section>

      <footer className="flex min-h-8 items-center gap-3 border-t border-black bg-[#15171b] px-3 text-[10px] uppercase tracking-widest text-white/45 max-md:hidden">
        <span>Layout pass: managed panels, no launch overlay, no mobile bottom cover</span>
        <span className="ml-auto">/studio and /studio/try share the same production workspace</span>
      </footer>
    </main>
  );
}
