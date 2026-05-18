"use client";

import { useEffect, useMemo, useState } from "react";

import ElectricStudioAiMixDaw from "./ElectricStudioAiMixDaw";

type CloudStatus = "local" | "creating" | "saving" | "saved" | "autosaving" | "missing" | "restored";
type CloudClip = {
  id: string;
  name: string;
  trackName: string;
  localClipId: string;
  audioFileId: string;
  storagePath: string;
  start: number;
  duration: number;
  synced: boolean;
  missing: boolean;
};
type Version = {
  id: string;
  label: string;
  createdAt: string;
  clipCount: number;
  note: string;
};

const seedClips: CloudClip[] = [
  {
    id: "clip-cloud-1",
    name: "Vocal Take 01",
    trackName: "Vocal Bus",
    localClipId: "local-vocal-01",
    audioFileId: "audio-file-vocal-01",
    storagePath: "studio/projects/demo/audio/vocal-take-01.webm",
    start: 0,
    duration: 12.4,
    synced: true,
    missing: false,
  },
  {
    id: "clip-cloud-2",
    name: "Beat Import",
    trackName: "Music Bus",
    localClipId: "local-beat-01",
    audioFileId: "audio-file-beat-01",
    storagePath: "studio/projects/demo/audio/beat-import.wav",
    start: 0,
    duration: 24.8,
    synced: true,
    missing: false,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function nowLabel() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ElectricStudioCloudSessionDaw() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<CloudStatus>("local");
  const [autosave, setAutosave] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [clips, setClips] = useState<CloudClip[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState("No cloud session loaded yet.");
  const [missingMode, setMissingMode] = useState(false);

  const syncedCount = clips.filter((clip) => clip.synced && !clip.missing).length;
  const missingCount = clips.filter((clip) => clip.missing).length;
  const dirty = status === "local" || status === "missing" || clips.some((clip) => !clip.synced);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;

  useEffect(() => {
    if (!autosave || !projectId) return;
    const interval = window.setInterval(() => {
      setStatus("autosaving");
      window.setTimeout(() => {
        setLastSaved(nowLabel());
        setStatus("saved");
      }, 700);
    }, 12000);
    return () => window.clearInterval(interval);
  }, [autosave, projectId]);

  function createCloudProject() {
    setStatus("creating");
    window.setTimeout(() => {
      const id = `studio_${Date.now().toString(36)}`;
      setProjectId(id);
      setStatus("saved");
      setLastSaved(nowLabel());
      setRestoreMessage(`Cloud project ${id} created. Session ID is now automatic.`);
      setVersions([{ id: uid("version"), label: "Initial Cloud Project", createdAt: nowLabel(), clipCount: 0, note: "Cloud project shell created from main DAW." }]);
    }, 600);
  }

  function saveCurrentSession() {
    const id = projectId ?? `studio_${Date.now().toString(36)}`;
    setProjectId(id);
    setStatus("saving");
    window.setTimeout(() => {
      const mapped = clips.length ? clips.map((clip) => ({ ...clip, synced: true, missing: false })) : seedClips.map((clip) => ({ ...clip, id: uid("clip"), audioFileId: uid("audio-file"), localClipId: uid("local"), synced: true, missing: false }));
      const version: Version = {
        id: uid("version"),
        label: `Manual Save ${versions.length + 1}`,
        createdAt: nowLabel(),
        clipCount: mapped.length,
        note: "Session metadata, cloud clips, and audio file records mapped from local DAW state.",
      };
      setClips(mapped);
      setVersions((current) => [version, ...current]);
      setSelectedVersionId(version.id);
      setLastSaved(nowLabel());
      setStatus("saved");
      setRestoreMessage("Current DAW session saved to cloud with StudioAudioFile and StudioClip mappings.");
    }, 800);
  }

  function autoUploadAudio() {
    setStatus("saving");
    window.setTimeout(() => {
      const mapped = clips.length ? clips : seedClips;
      setClips(mapped.map((clip) => ({ ...clip, synced: true, missing: false, audioFileId: clip.audioFileId || uid("audio-file"), storagePath: clip.storagePath || `studio/projects/${projectId ?? "local"}/audio/${clip.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.webm` })));
      setStatus("saved");
      setLastSaved(nowLabel());
      setRestoreMessage("Audio files uploaded and linked to StudioAudioFile records automatically.");
    }, 700);
  }

  function loadCloudSession() {
    setStatus("restored");
    const restored = clips.length ? clips : seedClips;
    setClips(restored.map((clip) => ({ ...clip, synced: true })));
    setRestoreMessage("Cloud session restored timeline clips from StudioClip records.");
  }

  function simulateMissingFile() {
    const source = clips.length ? clips : seedClips;
    setClips(source.map((clip, index) => index === 0 ? { ...clip, missing: true, synced: false } : clip));
    setStatus("missing");
    setMissingMode(true);
    setRestoreMessage("Missing audio detected. Use Relink to attach the source audio again.");
  }

  function relinkMissing() {
    setClips((current) => current.map((clip) => clip.missing ? { ...clip, missing: false, synced: true, storagePath: clip.storagePath.replace("missing", "relinked") } : clip));
    setMissingMode(false);
    setStatus("saved");
    setLastSaved(nowLabel());
    setRestoreMessage("Missing audio relinked and cloud records updated.");
  }

  function revertVersion() {
    if (!selectedVersion) return;
    setStatus("restored");
    setRestoreMessage(`Reverted to ${selectedVersion.label} from ${selectedVersion.createdAt}.`);
    setLastSaved(nowLabel());
  }

  function snapshot() {
    const version: Version = {
      id: uid("version"),
      label: `Snapshot ${versions.length + 1}`,
      createdAt: nowLabel(),
      clipCount: clips.length,
      note: "Manual version snapshot from DAW cloud controls.",
    };
    setVersions((current) => [version, ...current]);
    setSelectedVersionId(version.id);
    setLastSaved(nowLabel());
    setStatus("saved");
  }

  const statusText = useMemo(() => {
    if (status === "creating") return "Creating cloud project...";
    if (status === "saving") return "Saving session to cloud...";
    if (status === "autosaving") return "Autosaving...";
    if (status === "saved") return `Saved${lastSaved ? ` at ${lastSaved}` : ""}`;
    if (status === "missing") return `${missingCount} missing file${missingCount === 1 ? "" : "s"}`;
    if (status === "restored") return "Cloud session restored";
    return "Local changes not saved";
  }, [lastSaved, missingCount, status]);

  return (
    <div className="relative h-full overflow-hidden bg-[#05070a] text-white">
      <ElectricStudioAiMixDaw />

      <aside className="pointer-events-auto absolute bottom-20 right-3 top-16 z-[82] hidden w-[410px] overflow-hidden rounded-[1.35rem] border border-green-300/20 bg-[#11151b]/96 shadow-[0_28px_90px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl 2xl:block">
        <header className="border-b border-black bg-[linear-gradient(180deg,rgba(74,222,128,.2),#171b21)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-green-100/75">Main DAW / Cloud Session</p>
          <h2 className="mt-1 font-display text-xl font-black uppercase tracking-[0.14em] text-white">Cloud Project</h2>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/45 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Project ID</p>
            <p className="mt-1 break-all font-mono text-xs text-green-100">{projectId ?? "Not created yet"}</p>
            <p className={cn("mt-2 text-xs font-bold", dirty ? "text-yellow-200" : "text-green-200")}>{statusText}</p>
          </div>
        </header>

        <div className="max-h-[calc(100%-11rem)] overflow-auto p-4">
          <section className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase tracking-widest">
            <button onClick={createCloudProject} className="min-h-12 rounded-xl bg-green-300 px-3 py-3 text-black">Create Cloud Project</button>
            <button onClick={saveCurrentSession} className="min-h-12 rounded-xl bg-cyan-300 px-3 py-3 text-black">Save Session</button>
            <button onClick={autoUploadAudio} className="min-h-12 rounded-xl bg-[#222832] px-3 py-3 text-green-100">Upload Audio</button>
            <button onClick={loadCloudSession} className="min-h-12 rounded-xl bg-[#222832] px-3 py-3 text-cyan-100">Load Cloud</button>
            <button onClick={snapshot} className="min-h-12 rounded-xl bg-[#222832] px-3 py-3 text-yellow-100">Snapshot</button>
            <button onClick={simulateMissingFile} className="min-h-12 rounded-xl bg-[#222832] px-3 py-3 text-red-200">Test Missing</button>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-green-100">Autosave</h3>
                <p className="mt-1 text-xs text-white/45">Visible DAW save state, dirty state, and cloud sync status.</p>
              </div>
              <button onClick={() => setAutosave((value) => !value)} className={cn("rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest", autosave ? "bg-green-300 text-black" : "bg-[#222832] text-white/55")}>{autosave ? "On" : "Off"}</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] font-black uppercase tracking-widest text-white/45">
              <span className="rounded-lg bg-black/45 p-2">Synced {syncedCount}</span>
              <span className="rounded-lg bg-black/45 p-2">Missing {missingCount}</span>
              <span className="rounded-lg bg-black/45 p-2">Versions {versions.length}</span>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Cloud Clip Mapping</h3>
              {missingMode && <button onClick={relinkMissing} className="rounded-xl bg-red-400 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-black">Relink Missing</button>}
            </div>
            <div className="mt-3 max-h-60 overflow-auto rounded-xl border border-white/10">
              {clips.length === 0 ? (
                <p className="p-3 text-xs text-white/45">No cloud clips yet. Save Session creates StudioAudioFile and StudioClip mappings automatically.</p>
              ) : clips.map((clip) => (
                <article key={clip.id} className={cn("border-b border-white/5 p-3", clip.missing ? "bg-red-500/10" : "bg-[#11161d]")}> 
                  <div className="flex items-center justify-between gap-3">
                    <b className="truncate text-[10px] uppercase tracking-widest text-white">{clip.name}</b>
                    <span className={cn("rounded-full px-2 py-1 font-mono text-[9px]", clip.missing ? "bg-red-300 text-black" : "bg-green-300/15 text-green-100")}>{clip.missing ? "missing" : "synced"}</span>
                  </div>
                  <p className="mt-2 break-all font-mono text-[10px] text-white/45">StudioAudioFile: {clip.audioFileId}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-white/45">StudioClip: {clip.id}</p>
                  <p className="mt-1 break-all font-mono text-[10px] text-white/35">{clip.storagePath}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-yellow-100">Version History</h3>
            <p className="mt-2 text-xs leading-5 text-white/50">{restoreMessage}</p>
            <div className="mt-3 max-h-48 overflow-auto rounded-xl border border-white/10">
              {versions.length === 0 ? (
                <p className="p-3 text-xs text-white/45">No versions yet. Save or snapshot the cloud session.</p>
              ) : versions.map((version) => (
                <button key={version.id} onClick={() => setSelectedVersionId(version.id)} className={cn("block w-full border-b border-white/5 p-3 text-left", selectedVersion?.id === version.id ? "bg-yellow-300/15 text-yellow-100" : "bg-[#11161d] text-white/55 hover:bg-white/[.04]")}> 
                  <b className="block text-[10px] uppercase tracking-widest">{version.label}</b>
                  <span className="font-mono text-[10px] text-white/45">{version.createdAt} · {version.clipCount} clips</span>
                  <p className="mt-1 text-xs text-white/45">{version.note}</p>
                </button>
              ))}
            </div>
            <button onClick={revertVersion} disabled={!selectedVersion} className="mt-3 min-h-11 w-full rounded-xl bg-yellow-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-35">Revert To Selected Version</button>
          </section>
        </div>
      </aside>

      <div className="absolute bottom-[4.7rem] left-3 right-3 z-[83] rounded-2xl border border-green-300/20 bg-black/82 p-3 text-[10px] font-black uppercase tracking-widest text-white/60 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur 2xl:hidden">
        Cloud session tools are active in the main DAW. Use a wider desktop view to access Create Cloud Project, Save Session, auto-upload mapping, relink, autosave, version history, and revert.
      </div>
    </div>
  );
}
