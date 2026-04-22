"use client";

import dynamic from "next/dynamic";
import type { CityBuilding } from "@/app/api/city/data/route";

const CityScene3D = dynamic(() => import("@/components/CityScene3D"), {
  ssr: false,
  loading: () => null,
});

export default function HeroCityCanvas({
  buildings,
}: {
  buildings: CityBuilding[];
}) {
  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden"
      style={{ pointerEvents: "none" }}
    >
      <div className="relative h-full w-full">
        <CityScene3D buildings={buildings} />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#07090d] via-[#07090d]/80 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#07090d]/60" />
    </div>
  );
}
