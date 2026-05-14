"use client";

import Link from "next/link";
import { memo } from "react";

function StudioCollabPanel() {
  return (
    <section className="min-h-[680px] overflow-y-auto overscroll-contain rounded-xl border border-cyan-300/25 bg-black/50 p-4 pr-2">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/70">Collab Console</p>
      <h2 className="mt-1 text-3xl font-black uppercase">Live session controls</h2>
      <p className="mt-2 text-sm text-white/55">Open the full collab console for LiveKit room join, invite permissions, moderation, device check, and persistent room state.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/studio/collab" className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 p-4 text-center text-sm font-black uppercase text-cyan-100">Open Collab Console</Link>
        <Link href="/studio/collab?roomId=ems-main-room" className="rounded-xl border border-pink-300/35 bg-pink-300/10 p-4 text-center text-sm font-black uppercase text-pink-100">Main Room</Link>
      </div>
    </section>
  );
}

export default memo(StudioCollabPanel);
