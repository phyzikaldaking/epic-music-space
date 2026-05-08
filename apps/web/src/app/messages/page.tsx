import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MessagesClient from "./MessagesClient";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/messages");
  }
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span aria-hidden className="led-on-amber h-2.5 w-2.5 rounded-full" />
        <h1 className="font-display text-4xl uppercase tracking-wider text-white">
          Talkback
        </h1>
        <span className="studio-label ml-auto text-white/35">MSG-01</span>
      </div>
      <p className="mb-6 text-sm text-white/55">
        Direct conversations with other artists and listeners — like the
        talkback channel between rooms.
      </p>
      <MessagesClient viewerId={session.user.id} />
    </div>
  );
}
