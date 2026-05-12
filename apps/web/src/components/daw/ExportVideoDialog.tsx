"use client";

import { useState } from "react";
import { type EngineSnapshot } from "@/components/daw/dawEngine";

interface ExportVideoDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
  snapshot?: EngineSnapshot;
}

export default function ExportVideoDialog({
  projectId,
  projectName,
  open,
  onClose,
  snapshot,
}: ExportVideoDialogProps) {
  const [format, setFormat] = useState<"waveform" | "waveform-lyrics">(
    "waveform"
  );
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleExport() {
    setExporting(true);
    setError(null);

    try {
      const res = await fetch("/api/studio/export/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          format,
          width,
          height,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as any;
        throw new Error(data.error || `Export failed (${res.status})`);
      }

      // For now: show success message
      // Real implementation would download the MP4 file or show progress
      alert(`✅ Video export queued. Check back soon!`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0c0c12] p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4">Export as Video</h2>

        <div className="space-y-4">
          {/* Format */}
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase">
              Format
            </label>
            <div className="mt-2 flex gap-2">
              {(["waveform", "waveform-lyrics"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={`flex-1 rounded px-3 py-2 text-xs font-bold transition ${
                    format === fmt
                      ? "bg-tube-300 text-black"
                      : "border border-white/20 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {fmt === "waveform" ? "Waveform" : "Waveform + Lyrics"}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="text-xs font-semibold text-white/60 uppercase">
              Resolution
            </label>
            <div className="mt-2 flex gap-2">
              {[
                { w: 1280, h: 720, label: "720p" },
                { w: 1920, h: 1080, label: "1080p" },
                { w: 3840, h: 2160, label: "4K" },
              ].map(({ w, h, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setWidth(w);
                    setHeight(h);
                  }}
                  className={`flex-1 rounded px-3 py-2 text-xs font-bold transition ${
                    width === w && height === h
                      ? "bg-tube-300 text-black"
                      : "border border-white/20 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && <div className="text-xs text-red-400">{error}</div>}

          {/* Info */}
          <div className="rounded bg-white/5 p-3 text-[11px] text-white/60">
            Creates an MP4 video with animated waveform visualization. Perfect
            for social media. Size: ~{Math.round((width * height) / 100000)}MB
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded border border-white/20 px-4 py-2 text-sm font-bold text-white/60 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 rounded bg-tube-300 px-4 py-2 text-sm font-bold text-black hover:bg-tube-200 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
