"use client";

import { useEffect, useRef, useState } from "react";

// One-tap import for voice memos. Producers regularly hum / sketch
// ideas into iPhone Voice Memos or Android Recorder, then need to
// drop them into a session for a vocal reference or rough vocal
// stem. This button:
//
//   1. Triggers a file picker filtered to audio mime types — iOS &
//      Android both surface the user's voice-memo library directly.
//   2. Listens for clipboard pastes — iOS Voice Memos' "Share" sheet
//      puts the m4a on the clipboard.
//
// Either path calls onImport(file) and the workspace handles
// addTrack + importAudioFile + level-set.

export default function VoiceMemoImportButton({
  onImport,
}: {
  onImport: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState(false);

  // Global paste handler — picks up audio blobs from the clipboard.
  // We only fire when the user genuinely pasted a *file*, never on
  // plain-text pastes (which would otherwise spam the workspace).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("audio/")) {
          const file = item.getAsFile();
          if (!file) continue;
          // Stamp a recognisable name if the clipboard didn't carry one
          // (iOS sometimes drops "Audio.m4a" with no real label).
          const named =
            file.name && file.name.length > 0
              ? file
              : new File([file], `voice-memo-${Date.now()}.m4a`, { type: file.type });
          onImport(named);
          setPasted(true);
          window.setTimeout(() => setPasted(false), 2000);
          e.preventDefault();
          break;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onImport]);

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition ${
          pasted
            ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
            : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
        }`}
        title="Pick a voice memo — or paste one (⌘V) from your phone's share sheet"
      >
        <span aria-hidden>🎙️</span>
        {pasted ? "Imported!" : "Voice memo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.aac"
        // iOS surfaces Voice Memos directly when accept hints audio/*.
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.currentTarget.value = "";
        }}
      />
    </>
  );
}
