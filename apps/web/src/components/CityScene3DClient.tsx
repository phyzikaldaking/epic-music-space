"use client";

import dynamic from "next/dynamic";
import type { CityBuilding } from "@/app/api/city/data/route";
import ErrorBoundary from "@/components/ErrorBoundary";

const CityScene3D = dynamic(() => import("@/components/CityScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] w-full items-center justify-center rounded-2xl border border-white/8 bg-[#0d0d14]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        <p className="text-xs text-white/30">Loading 3D city...</p>
      </div>
    </div>
  ),
});

const cityFallback = (
  <div className="flex h-[520px] w-full items-center justify-center rounded-2xl border border-white/8 bg-[#0d0d14]">
    <div className="text-center">
      <p className="text-sm font-semibold text-white/50">3D city unavailable</p>
      <p className="mt-1 text-xs text-white/25">
        WebGL may not be supported in your browser.
      </p>
      <a
        href="/city"
        className="mt-4 inline-block rounded-lg border border-brand-500/30 px-4 py-1.5 text-xs text-brand-400 hover:bg-brand-500/10 transition"
      >
        View city map instead
      </a>
    </div>
  </div>
);

export default function CityScene3DClient({
  buildings,
}: {
  buildings: CityBuilding[];
}) {
  return (
    <ErrorBoundary fallback={cityFallback} label="3D City">
      <CityScene3D buildings={buildings} />
    </ErrorBoundary>
  );
}
