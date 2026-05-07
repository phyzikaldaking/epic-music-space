import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import DawWorkspace from "@/components/daw/DawWorkspace";
import GuestStudioBanner from "./GuestStudioBanner";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the Studio — no signup",
  description:
    "Make a beat, record a take, and mix — right in your browser. No account needed to start.",
};

/**
 * Guest entry to the DAW. The auth wall on /studio/board sent first-time
 * visitors through five clicks before they touched a control surface;
 * this lets them play immediately. Saving + publishing still require a
 * sign-up (the DAW's existing 401 handlers surface the prompt at the
 * moment they actually try to save), so the only real shift is *when*
 * we ask for the email — at "I want to keep this" instead of at "I'm
 * curious."
 */
export default async function StudioTryPage() {
  const session = await auth();
  const isAuthed = Boolean(session?.user?.id);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      {!isAuthed && <GuestStudioBanner />}
      <DawWorkspace />
    </div>
  );
}
