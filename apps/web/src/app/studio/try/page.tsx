import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import StudioTryClient from "./StudioTryClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Try the Studio — no signup",
  description:
    "Make a beat, record a take, and mix — right in your browser. No account needed to start.",
};

export default async function StudioTryPage() {
  const session = await auth();
  const isAuthed = Boolean(session?.user?.id);

  return (
    <div className="min-h-[calc(100vh-65px)] bg-gradient-to-b from-[#070710] via-[#0b0b18] to-[#040408]">
      <noscript>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <p className="studio-label text-rec-400">EMS Studio</p>
          <h1 className="mt-3 font-display text-4xl uppercase tracking-wider text-white">
            JavaScript is required to run the browser studio.
          </h1>
          <p className="mt-4 text-white/60">
            Turn JavaScript on, then reload this page to open the beat machine,
            mixer, and recording tools.
          </p>
        </div>
      </noscript>
      <StudioTryClient isAuthed={isAuthed} />
    </div>
  );
}
