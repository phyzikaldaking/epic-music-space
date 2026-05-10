"use client";

import { useEffect, useRef, useState } from "react";

interface StudioDropOverlayProps {
  onFiles: (files: File[]) => void | Promise<void>;
}

/** Window-level drag-drop catcher for the studio.
 *
 *  Renders a full-viewport tube-amber overlay when audio files are being
 *  dragged in from outside the page. Drops anywhere on the studio (not just
 *  the small uploader card) route through to onFiles. Solves the discovery
 *  problem where users tried to drag a sample onto the workspace and nothing
 *  visible happened. */
export default function StudioDropOverlay({ onFiles }: StudioDropOverlayProps) {
  const [active, setActive] = useState(false);
  const dragCountRef = useRef(0);

  useEffect(() => {
    function hasFiles(event: DragEvent): boolean {
      const types = event.dataTransfer?.types;
      if (!types) return false;
      for (let i = 0; i < types.length; i++) {
        if (types[i] === "Files") return true;
      }
      return false;
    }

    function onEnter(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragCountRef.current += 1;
      if (dragCountRef.current === 1) setActive(true);
    }

    function onOver(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    }

    function onLeave(event: DragEvent) {
      if (!hasFiles(event)) return;
      dragCountRef.current = Math.max(0, dragCountRef.current - 1);
      if (dragCountRef.current === 0) setActive(false);
    }

    function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragCountRef.current = 0;
      setActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) void onFiles(files);
    }

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  if (!active) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[150] flex items-center justify-center bg-black/55 backdrop-blur-sm"
    >
      <div className="rounded-3xl border-4 border-dashed border-tube-300 bg-tube-300/10 px-12 py-10 text-center shadow-[0_0_60px_rgba(255,184,77,0.35)]">
        <div className="text-4xl">⤓</div>
        <div className="mt-3 text-sm font-black uppercase tracking-[0.32em] text-tube-300">
          Drop sounds anywhere
        </div>
        <div className="mt-1 text-xs text-white/70">
          WAV · MP3 · FLAC · AIFF · OGG · M4A
        </div>
      </div>
    </div>
  );
}
