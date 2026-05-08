"use client";

import { useRef, useState } from "react";

interface Props {
  onImportFiles: (files: File[]) => Promise<void>;
}

const ACCEPT = "audio/*,.wav,.mp3,.flac,.m4a,.aif,.aiff,.ogg";

export default function ProducerKitUploader({ onImportFiles }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function importFiles(files: File[]) {
    if (!files.length || busy) return;
    setBusy(true);
    try {
      await onImportFiles(files);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#0f1320] via-[#0e1220] to-[#111723] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200/85">
            Sound Kit Uploader
          </p>
          <p className="mt-1 text-xs text-white/60">
            Drop your kit files and we auto-create one track per sample. Great for kicks, snares, hats, 808s, FX, and vocal chops.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
        >
          {busy ? "Importing..." : "Choose files"}
        </button>
        <button
          type="button"
          onClick={() => directoryInputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-100 transition hover:bg-violet-500/20 disabled:opacity-60"
        >
          {busy ? "Importing..." : "Choose folder"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Upload producer sound-kit samples"
        title="Upload producer sound-kit samples"
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          await importFiles(files);
        }}
      />

      <input
        ref={directoryInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Upload producer sound-kit folder"
        title="Upload producer sound-kit folder"
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.currentTarget.value = "";
          await importFiles(files);
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          await importFiles(files);
        }}
        className={`mt-3 rounded-xl border border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "border-cyan-300/70 bg-cyan-400/10"
            : "border-white/20 bg-white/[0.03] hover:border-cyan-400/45"
        }`}
        aria-label="Drop kit samples here"
      >
        <p className="text-sm font-bold text-white/90">Drop sound-kit files here</p>
        <p className="mt-1 text-xs text-white/55">WAV, MP3, FLAC, AIFF, OGG, M4A · files or full folders · up to 24 files at once</p>
      </div>

      <div className="mt-3 grid gap-1 text-[11px] text-white/55 sm:grid-cols-2 lg:grid-cols-4">
        <p>Kick/snare/hat files are grouped with drum colors.</p>
        <p>808/sub files get bass colors.</p>
        <p>Vocal chops get vocal colors.</p>
        <p>Rename files before upload to keep tracks organized.</p>
      </div>
    </section>
  );
}
