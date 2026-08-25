"use client";

import { useEffect, useState } from "react";
import { validateUpload } from "@/lib/uploadValidation";

type UploadState = {
  status: "idle" | "uploading" | "complete" | "error";
  message: string;
  percent: number;
  uploaded: Array<{ name: string; url?: string; clipId?: string; audioFileId?: string }>;
};

type LocalStudioSession = {
  title?: string;
  bpm?: number;
  sampleRate?: number;
  masterVolume?: number;
  tracks?: Array<{ id?: string; kind?: string; name?: string; volume?: number; pan?: number; clips?: unknown[] }>;
};

const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;
const localSessionKey = "ems.workflow.session.v3";
const cloudProjectKey = "ems.workflow.cloudProjectId.v1";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

async function decodeDuration(file: File) {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return 0;
  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
    return buffer.duration;
  } catch {
    return 0;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function loadLocalSession(): LocalStudioSession | null {
  try {
    const raw = localStorage.getItem(localSessionKey);
    return raw ? JSON.parse(raw) as LocalStudioSession : null;
  } catch {
    return null;
  }
}

export default function StudioCloudUploadPanel() {
  const [projectId, setProjectId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [createClip, setCreateClip] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [projectName, setProjectName] = useState("Untitled Studio Session");
  const [localSession, setLocalSession] = useState<LocalStudioSession | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [state, setState] = useState<UploadState>({ status: "idle", message: "Ready to upload source audio to cloud storage.", percent: 0, uploaded: [] });

  useEffect(() => {
    const storedProjectId = localStorage.getItem(cloudProjectKey) ?? "";
    if (storedProjectId) setProjectId(storedProjectId);
    const session = loadLocalSession();
    setLocalSession(session);
    if (session?.title) setProjectName(session.title);
  }, []);

  function refreshLocalSession() {
    const session = loadLocalSession();
    setLocalSession(session);
    if (session?.title) setProjectName(session.title);
    setState((current) => ({ ...current, message: session ? "Loaded local DAW session metadata." : "No local DAW session found. Use Save in the DAW first." }));
  }

  async function createCloudProject() {
    setCreatingProject(true);
    setState((current) => ({ ...current, status: "uploading", message: "Creating cloud StudioProject...", percent: 10 }));
    try {
      const session = localSession ?? loadLocalSession();
      const tracks = session?.tracks ?? [];
      const response = await fetch("/api/studio/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim() || session?.title || "Untitled Studio Session",
          bpm: Number(session?.bpm ?? 120),
          trackCount: tracks.length,
          patternJson: {
            source: "studio-cloud-panel",
            sampleRate: session?.sampleRate ?? 48000,
            masterVolume: session?.masterVolume ?? 85,
            tracks: tracks.map((track) => ({
              id: track.id,
              kind: track.kind,
              name: track.name,
              volume: track.volume,
              pan: track.pan,
              clipCount: Array.isArray(track.clips) ? track.clips.length : 0,
            })),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Could not create cloud project.");
      const id = String(payload.id ?? "");
      if (!id) throw new Error("Cloud project did not return an ID.");
      setProjectId(id);
      localStorage.setItem(cloudProjectKey, id);
      setState({ status: "complete", message: `Created cloud project ${id}.`, percent: 100, uploaded: [] });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Cloud project creation failed.", percent: 0, uploaded: [] });
    } finally {
      setCreatingProject(false);
    }
  }

  async function saveCurrentSessionMetadata() {
    const cleanProjectId = projectId.trim();
    if (!cleanProjectId) {
      setState((current) => ({ ...current, status: "error", message: "Create or enter a cloud project ID first.", percent: 0 }));
      return;
    }
    const session = localSession ?? loadLocalSession();
    if (!session) {
      setState((current) => ({ ...current, status: "error", message: "No local DAW session found. Click Save in the DAW first.", percent: 0 }));
      return;
    }
    setSavingSession(true);
    setState((current) => ({ ...current, status: "uploading", message: "Saving session metadata to cloud...", percent: 20 }));
    try {
      const tracks = session.tracks ?? [];
      const response = await fetch(`/api/studio/projects/${encodeURIComponent(cleanProjectId)}/production`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim() || session.title || "Untitled Studio Session",
          bpm: Number(session.bpm ?? 120),
          trackCount: tracks.length,
          patternJson: {
            source: "studio-cloud-panel-save",
            savedAt: new Date().toISOString(),
            sampleRate: session.sampleRate ?? 48000,
            masterVolume: session.masterVolume ?? 85,
            tracks: tracks.map((track) => ({
              id: track.id,
              kind: track.kind,
              name: track.name,
              volume: track.volume,
              pan: track.pan,
              clipCount: Array.isArray(track.clips) ? track.clips.length : 0,
            })),
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Could not save session metadata.");
      localStorage.setItem(cloudProjectKey, cleanProjectId);
      setState((current) => ({ ...current, status: "complete", message: "Saved current DAW session metadata to cloud.", percent: 100 }));
    } catch (err) {
      setState((current) => ({ ...current, status: "error", message: err instanceof Error ? err.message : "Session metadata save failed.", percent: 0 }));
    } finally {
      setSavingSession(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const cleanProjectId = projectId.trim();
    if (!cleanProjectId) {
      setState((current) => ({ ...current, status: "error", message: "Create or enter a StudioProject ID first.", percent: 0 }));
      return;
    }

    const candidates = Array.from(files);
    const rejected = candidates.map((file) => ({ file, result: validateUpload("audio", file) })).filter((item) => !item.result.ok);
    if (rejected.length) {
      const first = rejected[0];
      setState((current) => ({ ...current, status: "error", message: `${first.file.name}: ${first.result.reason}`, percent: 0 }));
      return;
    }
    const audioFiles = candidates.filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
    if (!audioFiles.length) {
      setState((current) => ({ ...current, status: "error", message: "Choose WAV, MP3, M4A, AAC, OGG, WEBM, FLAC, AIFF, or MP4 audio.", percent: 0 }));
      return;
    }

    setState({ status: "uploading", message: `Uploading ${audioFiles.length} file(s)...`, percent: 2, uploaded: [] });
    const uploaded: UploadState["uploaded"] = [];

    for (let index = 0; index < audioFiles.length; index += 1) {
      const file = audioFiles[index];
      const durationSec = await decodeDuration(file);
      const form = new FormData();
      form.append("file", file);
      form.append("durationSec", String(durationSec));
      form.append("createClip", String(createClip));
      form.append("startSec", String(startSec));
      form.append("color", "#65d6ff");
      if (trackId.trim()) form.append("trackId", trackId.trim());

      setState((current) => ({ ...current, status: "uploading", message: `Uploading ${file.name}`, percent: Math.round((index / audioFiles.length) * 80) + 5, uploaded }));

      const response = await fetch(`/api/studio/projects/${encodeURIComponent(cleanProjectId)}/audio/upload`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState({ status: "error", message: payload?.error ?? `Upload failed for ${file.name}`, percent: 0, uploaded });
        return;
      }

      uploaded.push({
        name: file.name,
        url: payload?.url,
        clipId: payload?.clip?.id,
        audioFileId: payload?.audioFile?.id,
      });
    }

    localStorage.setItem(cloudProjectKey, cleanProjectId);
    setState({ status: "complete", message: `Uploaded ${uploaded.length} file(s) to cloud storage.`, percent: 100, uploaded });
  }

  return (
    <main className="h-dvh overflow-auto bg-[#101319] px-6 py-16 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#171b22] p-6 shadow-[0_24px_80px_rgba(0,0,0,.45)]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Production storage</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-white">Cloud project + audio upload</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Create a cloud StudioProject, save the current local DAW session metadata, then upload real source audio into Vercel Blob with StudioAudioFile and StudioClip records.
        </p>

        <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[260px] flex-1 text-xs font-black uppercase tracking-widest text-white/50">
              Project name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Untitled Studio Session"
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:border-cyan-300"
              />
            </label>
            <button disabled={creatingProject} onClick={() => void createCloudProject()} className="rounded-full bg-cyan-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-black disabled:opacity-50">
              {creatingProject ? "Creating..." : "Create Cloud Project"}
            </button>
            <button onClick={refreshLocalSession} className="rounded-full border border-white/20 px-5 py-3 text-xs font-black uppercase tracking-widest text-white/70">
              Refresh Local Session
            </button>
            <button disabled={savingSession} onClick={() => void saveCurrentSessionMetadata()} className="rounded-full bg-green-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-black disabled:opacity-50">
              {savingSession ? "Saving..." : "Save Session to Cloud"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-xs text-white/55 md:grid-cols-3">
            <span>Local title: <b className="text-white/80">{localSession?.title ?? "none"}</b></span>
            <span>BPM: <b className="text-white/80">{localSession?.bpm ?? "none"}</b></span>
            <span>Tracks: <b className="text-white/80">{localSession?.tracks?.length ?? 0}</b></span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-black uppercase tracking-widest text-white/50">
            StudioProject ID
            <input
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="Create automatically or paste project id"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:border-cyan-300"
            />
          </label>
          <label className="block text-xs font-black uppercase tracking-widest text-white/50">
            Optional StudioTrack ID
            <input
              value={trackId}
              onChange={(event) => setTrackId(event.target.value)}
              placeholder="Paste track id or leave blank"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:border-cyan-300"
            />
          </label>
          <label className="block text-xs font-black uppercase tracking-widest text-white/50">
            Clip start seconds
            <input
              type="number"
              min="0"
              step="0.01"
              value={startSec}
              onChange={(event) => setStartSec(Number(event.target.value) || 0)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:border-cyan-300"
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white/60">
            <input type="checkbox" checked={createClip} onChange={(event) => setCreateClip(event.target.checked)} className="h-4 w-4 accent-cyan-300" />
            Create linked StudioClip
          </label>
        </div>

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(event.dataTransfer.files);
          }}
          className="mt-6 rounded-3xl border border-dashed border-cyan-300/40 bg-cyan-300/5 p-8 text-center"
        >
          <p className="text-lg font-black uppercase tracking-widest text-cyan-100">Drop audio here</p>
          <p className="mt-2 text-sm text-white/50">or choose files from your computer</p>
          <label className="mt-5 inline-flex cursor-pointer rounded-full bg-cyan-300 px-6 py-3 text-xs font-black uppercase tracking-widest text-black hover:bg-cyan-200">
            Choose audio
            <input
              type="file"
              multiple
              accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac,.aif,.aiff,.mp4"
              className="sr-only"
              onChange={(event) => event.target.files && void uploadFiles(event.target.files)}
            />
          </label>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-4">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/45">
            <span>{state.message}</span>
            <span>{state.percent}%</span>
          </div>
          <div className="mt-2 h-3 bg-black">
            <div
              className={cn("h-full", state.status === "error" ? "bg-red-500" : state.status === "complete" ? "bg-green-400" : "bg-cyan-300")}
              style={{ width: `${Math.max(0, Math.min(100, state.percent))}%` }}
            />
          </div>
        </div>

        {state.uploaded.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="border-b border-white/10 bg-black/40 px-4 py-3 text-xs font-black uppercase tracking-widest text-white/50">Uploaded files</div>
            {state.uploaded.map((item) => (
              <div key={`${item.name}-${item.audioFileId}`} className="grid gap-2 border-b border-white/5 px-4 py-3 text-sm text-white/70 md:grid-cols-[1fr_1fr_1fr]">
                <span className="truncate">{item.name}</span>
                <span className="truncate font-mono text-cyan-100">audio: {item.audioFileId ?? "created"}</span>
                <span className="truncate font-mono text-pink-100">clip: {item.clipId ?? "none"}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm leading-6 text-yellow-50">
          <b className="block uppercase tracking-widest text-yellow-200">Launch note</b>
          Use Save in the DAW first, then this Cloud tab can create the project and save its metadata. Source audio still needs to be uploaded here because browser localStorage cannot persist original audio blobs.
        </div>
      </section>
    </main>
  );
}
