"use client";

import dynamic from "next/dynamic";
import type { CityBuilding } from "@/app/api/city/data/route";

const CityScene3D = dynamic(() => import("@/components/CityScene3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] w-full items-center justify-center rounded-2xl bg-[#0d0d14] border border-white/8">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
        <p className="text-xs text-white/30">Loading 3D city…</p>
      </div>
    </div>
  ),
});

export default function CityScene3DWrapper({ buildings }: { buildings: CityBuilding[] }) {
  return <CityScene3D buildings={buildings} />;
}
