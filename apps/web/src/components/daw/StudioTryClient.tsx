"use client";

import { useEffect, useRef } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import GuestStudioBanner from "./GuestStudioBanner";
import StudioFirstVisitTour from "./StudioFirstVisitTour";
import DawWorkspace from "@/components/daw/DawWorkspace";
import DemoSessionOverlay from "@/components/daw/DemoSessionOverlay";

export default function StudioTryClient({ isAuthed }: { isAuthed: boolean }) {
  const eventFiredRef = useRef(false);

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
      <DawWorkspace isGuest={!isAuthed} />
    </>
  );
}
