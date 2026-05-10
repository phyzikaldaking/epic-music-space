"use client";

/**
 * Viewport-aware switcher between PhoneStudio (small screens) and the
 * full DawWorkspace (desktop). Phone visitors get a stripped-down
 * 4-pad UI by default; they can opt into the full DAW with
 * ?force-desktop=1 (the "Want the full studio?" link in PhoneStudio).
 *
 * The switch happens client-side because we don't have viewport info
 * at SSR. We render nothing on first paint, then resolve once mounted
 * — that's fine here because /studio/try is interaction-driven, not
 * SEO-critical.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";
import GuestStudioBanner from "./GuestStudioBanner";
import StudioFirstVisitTour from "./StudioFirstVisitTour";

const DawWorkspace = dynamic(() => import("@/components/daw/DawWorkspace"), {
  ssr: false,
  loading: () => null,
});
const PhoneStudio = dynamic(() => import("./PhoneStudio"), {
  ssr: false,
  loading: () => null,
});
const DemoSessionOverlay = dynamic(
  () => import("@/components/daw/DemoSessionOverlay"),
  { ssr: false, loading: () => null },
);

const PHONE_BREAKPOINT_PX = 768;

export default function StudioTryClient({ isAuthed }: { isAuthed: boolean }) {
  const params = useSearchParams();
  const forceDesktop = params.get("force-desktop") === "1";
  const ref = params.get("ref") ?? "direct";
  const [mode, setMode] = useState<"loading" | "phone" | "desktop">("loading");
  const eventFiredRef = useRef(false);

  // One-shot funnel ping: the visitor reached the guest studio. Counted
  // once per page mount so a resize between phone/desktop modes doesn't
  // double-count.
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
    if (forceDesktop) { setMode("desktop"); return; }
    const update = () => {
      const isPhone = window.innerWidth < PHONE_BREAKPOINT_PX;
      setMode(isPhone ? "phone" : "desktop");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [forceDesktop]);

  if (mode === "loading") return null;
  if (mode === "phone") return <PhoneStudio />;

  return (
    <>
      {!isAuthed && <GuestStudioBanner />}
      {!isAuthed && <DemoSessionOverlay />}
      <StudioFirstVisitTour isAuthed={isAuthed} />
      <DawWorkspace isGuest={!isAuthed} />
    </>
  );
}
