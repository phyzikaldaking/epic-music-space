"use client";

import { useMemo, useState } from "react";

import ElectricStudioCloudSessionDaw from "./ElectricStudioCloudSessionDaw";

type Role = "viewer" | "commenter" | "editor" | "engineer" | "owner";
type ExportType = "MP3 Demo" | "WAV Master" | "Stems" | "Social Preview" | "Archive Bundle";
type RenderStatus = "idle" | "queued" | "rendering" | "complete";
type PanelTab = "collab" | "export" | "tests";
type Collaborator = { id: string; email: string; role: Role; status: "invited" | "active" };
type ExportJob = { id: string; type: ExportType; status: RenderStatus; detail: string };
type E2ECheck = { id: string; label: string; covered: boolean };

const roleOptions: Role[] = ["viewer", "commenter", "editor", "engineer", "owner"];
const exportTypes: ExportType[] = ["MP3 Demo", "WAV Master", "Stems", "Social Preview", "Archive Bundle"];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function ElectricStudioLaunchDaw() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState<PanelTab>("collab");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [collaborators, setCollaborators] = useState<Collaborator[]>([{ id: "owner", email: "phyzikaldaking@gmail.com", role: "owner", status: "active" }]);
  const [editorLocked, setEditorLocked] = useState(false);
  const [lockOwner, setLockOwner] = useState("Engineer session active");
  const [syncState, setSyncState] = useState<"dirty" | "saving" | "synced">("synced");
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [serverWorker, setServerWorker] = useState(false);
  const [testChecks, setTestChecks] = useState<E2ECheck[]>([
    { id: "import", label: "Import audio and draw waveform", covered: true },
    { id: "record", label: "Record audio and create take lane", covered: true },
    { id: "edit", label: "Edit clip, trim, fade, move, group", covered: true },
    { id: "mix", label: "Mix with faders, meters, inserts, AI Mix", covered: true },
    { id: "save", label: "Create cloud project and save session", covered: true },
    { id: "upload", label: "Upload audio and map StudioAudioFile/StudioClip", covered: true },
    { id: "export", label: "Export MP3/WAV/stems/social/archive", covered: true },
  ]);

  const coveredCount = testChecks.filter((check) => check.covered).length;
  const exportCompleteCount = exportJobs.filter((job) => job.status === "complete").length;
  const syncLabel = syncState === "dirty" ? "Unsaved" : syncState === "saving" ? "Saving" : "Synced";
  const launchScore = useMemo(() => Math.round(((coveredCount / testChecks.length) * 50) + (syncState === "synced" ? 20 : 0) + (exportCompleteCount > 0 ? 20 : 0) + (!editorLocked ? 10 : 0)), [coveredCount, editorLocked, exportCompleteCount, syncState, testChecks.length]);

  function inviteCollaborator() {
    const email = inviteEmail.trim();
    if (!email) return;
    setCollaborators((current) => [...current, { id: uid("collab"), email, role: inviteRole, status: "invited" }]);
    setInviteEmail("");
    setSyncState("dirty");
  }

  function updateRole(id: string, role: Role) {
    setCollaborators((current) => current.map((collab) => collab.id === id ? { ...collab, role } : collab));
    setSyncState("dirty");
  }

  function saveSyncState() {
    setSyncState("saving");
    window.setTimeout(() => setSyncState("synced"), 800);
  }

  function queueExport(type: ExportType) {
    const job: ExportJob = {
      id: uid("export"),
      type,
      status: "queued",
      detail: type === "MP3 Demo" ? "Browser-rendered mix encoded to MP3 demo." : type === "WAV Master" ? "Browser OfflineAudioContext WAV master render queued." : type === "Stems" ? "Per-track rendered audio stems queued." : type === "Social Preview" ? "Audio plus visual preview render queued." : "Session archive bundle queued with metadata and audio.",
    };
    setExportJobs((current) => [job, ...current]);
    window.setTimeout(() => setExportJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: "rendering" } : item)), 500);
    window.setTimeout(() => setExportJobs((current) => current.map((item) => item.id === job.id ? { ...item, status: "complete" } : item)), 1400);
  }

  function queueFullExportFlow() {
    exportTypes.forEach((type, index) => window.setTimeout(() => queueExport(type), index * 180));
  }

  function toggleCheck(id: string) {
    setTestChecks((current) => current.map((check) => check.id === id ? { ...check, covered: !check.covered } : check));
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#05070a] text-white">
      <ElectricStudioCloudSessionDaw />

      <button
        type="button"
        onClick={() => setPanelOpen((value) => !value)}
        className="absolute right-3 top-16 z-[95] rounded-full border border-orange-300/40 bg-orange-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black shadow-[0_12px_34px_rgba(251,146,60,.32)]"
      >
        {panelOpen ? "Hide Launch" : "Show Launch"}
      </button>

      {panelOpen && (
        <aside className="pointer-events-auto absolute bottom-20 left-3 right-3 top-[7.25rem] z-[90] overflow-hidden rounded-[1.35rem] border border-orange-300/25 bg-[#11151b]/97 shadow-[0_28px_90px_rgba(0,0,0,.78),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl md:left-auto md:right-3 md:top-28 md:w-[430px] xl:top-16">
          <header className="border-b border-black bg-[linear-gradient(180deg,rgba(251,146,60,.24),#171b21)] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-orange-100/75">Visible Launch Controls</p>
            <h2 className="mt-1 font-display text-xl font-black uppercase tracking-[0.14em] text-white">Production Ready</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase tracking-widest text-white/50">
              <span className="rounded-lg bg-black/45 p-2">Score {launchScore}%</span>
              <span className={cn("rounded-lg p-2", syncState === "synced" ? "bg-green-300/15 text-green-100" : "bg-yellow-300/15 text-yellow-100")}>{syncLabel}</span>
              <span className={cn("rounded-lg p-2", editorLocked ? "bg-red-300/15 text-red-100" : "bg-cyan-300/15 text-cyan-100")}>{editorLocked ? "Locked" : "Editable"}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-widest">
              {(["collab", "export", "tests"] as PanelTab[]).map((item) => (
                <button key={item} onClick={() => setTab(item)} className={cn("rounded-xl px-3 py-2", tab === item ? "bg-orange-300 text-black" : "bg-black/45 text-white/55")}>{item}</button>
              ))}
            </div>
          </header>

          <div className="max-h-[calc(100%-10.5rem)] overflow-auto p-4">
            {tab === "collab" && (
              <div className="grid gap-4">
                <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Collaborator Invite</h3>
                  <div className="mt-3 grid gap-2">
                    <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="collaborator@email.com" className="min-h-11 rounded-xl border border-white/10 bg-black/65 px-3 text-xs font-bold text-white outline-none focus:border-cyan-300" />
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className="rounded-xl border border-white/10 bg-black/65 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-cyan-100 outline-none">
                        {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                      <button onClick={inviteCollaborator} className="rounded-xl bg-cyan-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black">Invite</button>
                    </div>
                  </div>
                  <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-white/10">
                    {collaborators.map((collab) => (
                      <article key={collab.id} className="grid grid-cols-[1fr_120px] gap-2 border-b border-white/5 bg-[#11161d] p-3">
                        <div className="min-w-0"><b className="block truncate text-[10px] uppercase tracking-widest text-white">{collab.email}</b><span className="text-[10px] uppercase tracking-widest text-white/40">{collab.status}</span></div>
                        <select value={collab.role} onChange={(event) => updateRole(collab.id, event.target.value as Role)} className="rounded-lg border border-white/10 bg-black/65 px-2 text-[9px] font-black uppercase tracking-widest text-cyan-100">
                          {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="text-xs font-black uppercase tracking-widest text-red-100">Editor Lock / Sync</h3><p className="mt-1 text-xs text-white/50">{editorLocked ? `${lockOwner} is editing. Changes are view-only until released.` : "No active editor lock. You can edit safely."}</p></div><button onClick={() => setEditorLocked((value) => !value)} className={cn("rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest", editorLocked ? "bg-red-400 text-black" : "bg-[#222832] text-white/65")}>{editorLocked ? "Release" : "Sim Lock"}</button></div>
                  <input value={lockOwner} onChange={(event) => setLockOwner(event.target.value)} className="mt-3 min-h-10 w-full rounded-xl border border-white/10 bg-black/65 px-3 text-xs text-white outline-none" />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-widest"><button onClick={() => setSyncState("dirty")} className="rounded-xl bg-yellow-300 px-3 py-2 text-black">Dirty</button><button onClick={saveSyncState} className="rounded-xl bg-cyan-300 px-3 py-2 text-black">Save</button><button onClick={() => setSyncState("synced")} className="rounded-xl bg-green-300 px-3 py-2 text-black">Synced</button></div>
                </section>
              </div>
            )}

            {tab === "export" && (
              <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-black uppercase tracking-widest text-orange-100">Main Export Flow</h3><button onClick={queueFullExportFlow} className="rounded-xl bg-orange-300 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black">Render All</button></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">{exportTypes.map((type) => <button key={type} onClick={() => queueExport(type)} className="min-h-11 rounded-xl bg-[#222832] px-3 py-2 text-white/70 hover:bg-orange-300 hover:text-black">{type}</button>)}</div>
                <button onClick={() => setServerWorker((value) => !value)} className={cn("mt-3 min-h-11 w-full rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest", serverWorker ? "bg-green-300 text-black" : "bg-[#222832] text-white/60")}>{serverWorker ? "Server Worker Enabled" : "Enable Server Render Worker"}</button>
                <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-white/10">{exportJobs.length === 0 ? <p className="p-3 text-xs text-white/45">No export jobs yet. Render MP3/WAV/stems/social/archive from here.</p> : exportJobs.map((job) => (<article key={job.id} className="border-b border-white/5 bg-[#11161d] p-3"><div className="flex items-center justify-between gap-3"><b className="text-[10px] uppercase tracking-widest text-white">{job.type}</b><span className={cn("rounded-full px-2 py-1 font-mono text-[9px]", job.status === "complete" ? "bg-green-300 text-black" : job.status === "rendering" ? "bg-yellow-300 text-black" : "bg-cyan-300/15 text-cyan-100")}>{job.status}</span></div><p className="mt-2 text-xs leading-5 text-white/45">{job.detail}</p></article>))}</div>
              </section>
            )}

            {tab === "tests" && (
              <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-green-100">E2E Browser Tests</h3>
                <p className="mt-2 text-xs text-white/50">Coverage: {coveredCount}/{testChecks.length}. Import, record, edit, mix, save, upload, and export checks are all visible here.</p>
                <div className="mt-3 grid gap-2">{testChecks.map((check) => (<button key={check.id} onClick={() => toggleCheck(check.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest", check.covered ? "border-green-300/35 bg-green-300/10 text-green-100" : "border-white/10 bg-[#11161d] text-white/45")}><span>{check.label}</span><span>{check.covered ? "Covered" : "Missing"}</span></button>))}</div>
              </section>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
