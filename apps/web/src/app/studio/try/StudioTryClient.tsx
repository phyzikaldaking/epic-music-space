"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import GuestStudioBanner from "./GuestStudioBanner";
import StudioFirstVisitTour from "./StudioFirstVisitTour";

const DawWorkspace = dynamic(() => import("@/components/daw/DawWorkspace"), {
  ssr: true,
});

const PhoneStudio = dynamic(() => import("./PhoneStudio"), {
  ssr: true,
});

const DemoSessionOverlay = dynamic(
  () => import("@/components/daw/DemoSessionOverlay"),
  { ssr: true },
);

const PHONE_BREAKPOINT_PX = 768;

function StudioLoadingShell() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col justify-center px-4 py-10">
      <div className="rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/80">
              Epic Music Space
            </p>
            <h1 className="mt-2 font-display text-3xl uppercase tracking-[0.12em] text-white">
              Loading Studio Workspace
            </h1>
          </div>
          <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-300" />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="h-4 w-24 rounded bg-white/10" />
            <div className="mt-4 space-y-3">
              <div className="h-10 rounded-xl bg-white/5" />
              <div className="h-10 rounded-xl bg-white/5" />
              <div className="h-10 rounded-xl bg-white/5" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-4">
            <div className="grid grid-cols-8 gap-2">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 rounded-xl border border-white/6 bg-gradient-to-b from-white/10 to-white/[0.03]"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioTryClient({ isAuthed }: { isAuthed: boolean }) {
  const params = useSearchParams();
  const forceDesktop = params.get("force-desktop") === "1";
  const ref = params.get("ref") ?? "direct";
  const [mode, setMode] = useState<"loading" | "phone" | "desktop">("desktop");
  const eventFiredRef = useRef(false);

  useEffect(() => {
    if (eventFiredRef.current || isAuthed || mode === "loading") return;

    eventFiredRef.current = true;

    void postFunnelEvent({
      event: FUNNEL_EVENTS.guestStudioEntered,
      source: "studio_try",
      properties: { mode, ref },
    });
  }, [isAuthed, mode, ref]);

  useEffect(() => {
    if (forceDesktop) {
      setMode("desktop");
      return;
    }

    const update = () => {
      const isPhone = window.innerWidth < PHONE_BREAKPOINT_PX;
      setMode(isPhone ? "phone" : "desktop");
    };

    update();

    window.addEventListener("resize", update);

    return () => window.removeEventListener("resize", update);
  }, [forceDesktop]);

  if (mode === "loading") {
    return <StudioLoadingShell />;
  }

  if (mode === "phone") {
    return <PhoneStudio />;
  }

  return (
    <>
      {!isAuthed && <GuestStudioBanner />}
      {!isAuthed && <DemoSessionOverlay />}
      <StudioFirstVisitTour isAuthed={isAuthed} />
      <DawWorkspace isGuest={!isAuthed} />
    </>
  );
}
