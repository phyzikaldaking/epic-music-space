"use client";

import { useEffect, useRef } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import DawWorkspace from "@/components/daw/DawWorkspace";

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

  return <DawWorkspace isGuest={!isAuthed} />;
}
