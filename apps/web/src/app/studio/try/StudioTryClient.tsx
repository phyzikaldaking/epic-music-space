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

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import GuestStudioBanner from "./GuestStudioBanner";
import FirstBeatCoach from "./FirstBeatCoach";

const DawWorkspace = dynamic(() => import("@/components/daw/DawWorkspace"), {
  ssr: false,
  loading: () => null,
});
const PhoneStudio = dynamic(() => import("./PhoneStudio"), {
  ssr: false,
  loading: () => null,
});

const PHONE_BREAKPOINT_PX = 768;

export default function StudioTryClient({ isAuthed }: { isAuthed: boolean }) {
  const params = useSearchParams();
  const forceDesktop = params.get("force-desktop") === "1";
  const [mode, setMode] = useState<"loading" | "phone" | "desktop">("loading");

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
      {!isAuthed && <FirstBeatCoach />}
      <DawWorkspace isGuest={!isAuthed} />
    </>
  );
}
