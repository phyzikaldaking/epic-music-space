"use client";

import { useState } from "react";

type ExportFormat = "full_mix" | "stems" | "preview" | "license_package";

type ExportState = {
  status: "idle" | "queued" | "error";
  message: string;
  jobId?: string;
};

const actions: { label: string; format: ExportFormat; detail: string }[] = [
  { label: "Export Full Mix", format: "full_mix", detail: "Stereo master bounce" },
  { label: "Export Stems", format: "stems", detail: "Track-by-track delivery" },
  { label: "Preview Bounce", format: "preview", detail: "Fast review copy" },
  { label: "License Package", format: "license_package", detail: "Creator-ready files" },
];

export default function StudioExportActions({ projectId = "ems-default-project", sessionId = "ems-main-session" }: { projectId?: string; sessionId?: string }) {
  const [state, setState] = useState<ExportState>({ status: "idle", message: "Choose an export format." });
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  async function queueExport(format: ExportFormat) {
    setBusy(format);
    setState({ status: "idle", message: "Queueing export..." });
    try {
      const res = await fetch("/api/studio/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sessionId, format }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Export failed ${res.status}`);
      setState({ status: "queued", message: data?.message ?? "Export job queued.", jobId: data?.id ?? data?.job?.id });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Export failed." });
    } finally {
      setBusy(null);
    }
  }

  return <div className="mt-4 space-y-3">
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => <button key={action.format} disabled={Boolean(busy)} onClick={() => queueExport(action.format)} className="rounded-xl border border-green-300/30 bg-green-300/10 p-4 text-left text-sm font-black uppercase text-green-100 disabled:opacity-40">
        <span>{busy === action.format ? "Queueing..." : action.label}</span>
        <span className="mt-2 block text-[10px] font-medium uppercase tracking-widest text-white/45">{action.detail}</span>
      </button>)}
    </div>
    <div className={`rounded-xl border px-3 py-2 text-xs ${state.status === "error" ? "border-red-300/30 bg-red-300/10 text-red-100" : state.status === "queued" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 bg-black/35 text-white/55"}`}>
      <b className="uppercase">{state.status}</b>: {state.message}{state.jobId ? ` · ${state.jobId}` : ""}
    </div>
  </div>;
}
