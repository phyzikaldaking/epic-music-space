"use client";

import dynamic from "next/dynamic";

const StudioTryClient = dynamic(() => import("./try/StudioTryClient"), {
  ssr: false,
  loading: () => <div className="min-h-[60vh] grid place-items-center bg-[#07090b] text-xs font-black uppercase tracking-widest text-cyan-200">Loading Studio…</div>,
});

export default function StudioClientBoundary({ isAuthed }: { isAuthed: boolean }) {
  return <StudioTryClient isAuthed={isAuthed} />;
}
