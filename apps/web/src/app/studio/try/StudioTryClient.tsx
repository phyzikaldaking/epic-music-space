"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import GuestStudioBanner from "./GuestStudioBanner";
import StudioFirstVisitTour from "./StudioFirstVisitTour";

const DawWorkspace = dynamic(() => import("@/components/daw/DawWorkspace"), {
  ssr: false,
  loading: () => <div className="min-h-[60vh] grid place-items-center bg-[#07090b] text-xs font-black uppercase tracking-widest text-cyan-200">Loading Studio…</div>,
});

const DemoSessionOverlay = dynamic(
  () => import("@/components/daw/DemoSessionOverlay"),
  {
    ssr: false,
  },
);

export default function StudioTryClient({ isAuthed }: { isAuthed: boolean }) {
  const eventFiredRef = useRef(false);
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "beat" ? "beat" : undefined;

  useEffect(() => {
    if (eventFiredRef.current || isAuthed) return;

    eventFiredRef.current = true;

    void postFunnelEvent({
      event: FUNNEL_EVENTS.guestStudioEntered,
      source: "studio_try",
      properties: {
        mode: "desktop",
        ref: "direct",
      },
    });
  }, [isAuthed]);

  return (
    <>
      {!isAuthed && <GuestStudioBanner />}
      {!isAuthed && <DemoSessionOverlay />}
      <StudioFirstVisitTour isAuthed={isAuthed} />
      <DawWorkspace isGuest={!isAuthed} initialMode={initialMode} />
    </>
  );
}
