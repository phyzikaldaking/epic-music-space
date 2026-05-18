"use client";

import { useState } from "react";

type UploadState = {
  status: "idle" | "uploading" | "complete" | "error";
  message: string;
  percent: number;
  uploaded: Array<{ name: string; url?: string; clipId?: string; audioFileId?: string }>;
};

const audioPattern = /\.(wav|wave|mp3|m4a|aac|ogg|oga|webm|flac|aif|aiff|mp4)$/i;

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

export default function StudioCloudUploadPanel() {
  const [projectId, setProjectId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [createClip, setCreateClip] = useState(true);
  const [startSec, setStartSec] = useState(0);
  const [state, setState] = useState<UploadState>({ status: "idle", message: "Ready to upload source audio to cloud storage.", percent: 0, uploaded: [] });

  async function uploadFiles(files: FileList | File[]) {
    const cleanProjectId = projectId.trim();
    if (!cleanProjectId) {
      setState((current) => ({ ...current, status: "error", message: "Enter a StudioProject ID first.", percent: 0 }));
      return;
    }

    const audioFiles = Array.from(files).filter((file) => file.type.startsWith("audio/") || file.type === "video/mp4" || audioPattern.test(file.name));
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

    setState({ status: "complete", message: `Uploaded ${uploaded.length} file(s) to cloud storage.`, percent: 100, uploaded });
  }

  return (
    <main className="h-dvh overflow-auto bg-[#101319] px-6 py-16 text-white">
      <section className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-[#171b22] p-6 shadow-[0_24px_80px_rgba(0,0,0,.45)]">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Production storage</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-[0.12em] text-white">Cloud audio upload</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          This wires the studio UI to the production upload endpoint. It pushes real source audio into Vercel Blob, creates a StudioAudioFile record, and can create a linked StudioClip record for a chosen project.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-black uppercase tracking-widest text-white/50">
            StudioProject ID
            <input
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="Paste project id"
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
          This upload panel requires a logged-in user with editor, engineer, or owner access to the project, and Vercel Blob must have BLOB_READ_WRITE_TOKEN configured.
        </div>
      </section>
    </main>
  );
}
