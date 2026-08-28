"use client";

import dynamic from "next/dynamic";
import type { StudioMode } from "./try/studio/types";

const ElectricStudio = dynamic(() => import("./try/ElectricStudio"), {
  ssr: false,
  loading: () => (
    <div className="min-h-[60vh] grid place-items-center bg-[#07090b] text-xs font-black uppercase tracking-widest text-cyan-200">
      Loading Studio…
    </div>
  ),
});

export default function StudioClientBoundary({ initialMode }: { initialMode: StudioMode }) {
  return <ElectricStudio initialMode={initialMode} />;
}
