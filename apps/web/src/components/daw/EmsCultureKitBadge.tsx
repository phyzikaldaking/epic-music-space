"use client";

import { useEffect, useState } from "react";
import {
  EMS_CULTURE_KIT_ID,
  EMS_PRODUCER_CHAIN,
  fetchDefaultCultureKit,
  kitToLaneUrlMap,
  preloadCultureKit,
  type CultureKitPack,
} from "./cultureKitEngine";
import type { DrumKind } from "./beatMachine";

type EmsCultureKitBadgeProps = {
  onAutoLoad?: (samples: Record<DrumKind, string>, packName: string) => void;
  disabled?: boolean;
};

export default function EmsCultureKitBadge({ onAutoLoad, disabled = false }: EmsCultureKitBadgeProps) {
  const [kit, setKit] = useState<CultureKitPack | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [preloaded, setPreloaded] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadDefaultKit() {
      if (disabled || loadedOnce) return;
      setStatus("loading");
      try {
        const nextKit = await fetchDefaultCultureKit();
        if (!nextKit || cancelled) {
          setStatus("error");
          return;
        }

        const count = await preloadCultureKit(nextKit.samples, 32).catch(() => 0);
        if (cancelled) return;

        setKit(nextKit);
        setPreloaded(count);
        setStatus("ready");
        setLoadedOnce(true);

        if (nextKit.id === EMS_CULTURE_KIT_ID) {
          onAutoLoad?.(kitToLaneUrlMap(nextKit.samples), nextKit.name);
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void loadDefaultKit();
    return () => {
      cancelled = true;
    };
  }, [disabled, loadedOnce, onAutoLoad]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-100/85">
          Producer preset
        </p>
        <p className="text-xs font-black text-white">
          {kit?.name ?? EMS_PRODUCER_CHAIN.name}
        </p>
      </div>
      <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-100">
        {status === "loading" ? "Preloading" : status === "ready" ? `${preloaded} buffers ready` : status === "error" ? "Manual load" : "Auto"}
      </span>
      <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-fuchsia-100">
        808 heavy
      </span>
      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/65">
        Soft clip + loud bus
      </span>
    </div>
  );
}
