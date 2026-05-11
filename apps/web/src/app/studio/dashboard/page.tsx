import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import StudioHubClient from "../StudioHubClient";

export const metadata: Metadata = {
  title: "Studio · Dashboard",
  description:
    "Recent sessions, quick links, and account-level studio controls. The actual DAW lives at /studio/board.",
};

// The hub that used to live at /studio. Producers asked for the
// DAW to be at /studio so they don't scroll past marketing copy to
// start working; the dashboard view moved here. Reachable from the
// in-app account menu and the "← Dashboard" link inside the DAW
// header.
export default async function StudioDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=%2Fstudio%2Fdashboard");
  }
  const studio = await prisma.studio.findFirst({
    where: { userId: session.user.id },
    select: { username: true },
  }).catch(() => null);

  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      <header className="relative z-[1] mx-auto max-w-6xl px-4 pt-8 sm:pt-12">
        <div className="flex items-center gap-2">
          <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
          <p className="studio-label text-tube-300">
            EMS Studio · Dashboard
          </p>
          <Link
            href="/studio/board"
            className="studio-label ml-auto rounded-md border border-tube-300/35 bg-tube-300/15 px-2 py-0.5 text-tube-100 hover:bg-tube-300/25"
          >
            Open DAW →
          </Link>
        </div>
        <h1 className="mt-3 font-display text-2xl uppercase tracking-wider text-white sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/55">
          Recent sessions, links to your public studio, and the rest of
          the surface. The DAW itself is one click away.
        </p>
      </header>
      <StudioHubClient studioUsername={studio?.username ?? null} />
    </div>
  );
}
