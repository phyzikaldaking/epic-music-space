"use client";

import { memo } from "react";
import StudioExportActions from "./StudioExportActions";

type Props = {
  projectId: string;
  sessionId: string;
};

function StudioExportPanel({ projectId, sessionId }: Props) {
  return (
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-green-300/25 bg-black/50 p-4 pr-2">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-green-200/70">Export</p>
      <h2 className="mt-1 text-3xl font-black uppercase">Bounce and deliver</h2>
      <p className="mt-2 text-sm text-white/55">Full mix, stems, preview bounce, and licensing-ready delivery now queue through the production export API.</p>
      <StudioExportActions projectId={projectId} sessionId={sessionId} />
    </section>
  );
}

export default memo(StudioExportPanel);
