import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ManageTracksClient from "./ManageTracksClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Manage Tracks — Epic Music Space",
  description: "Edit pricing, drafts, and licensing for your published tracks.",
  robots: { index: false },
};

export default async function ManageTracksPage(props: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await props.searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/studio/manage");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || user.role === "LISTENER") redirect("/dashboard");

  const songs = await prisma.song.findMany({
    where: { artistId: session.user.id },
    select: {
      id: true,
      title: true,
      coverUrl: true,
      genre: true,
      licensePrice: true,
      revenueSharePct: true,
      totalLicenses: true,
      soldLicenses: true,
      streamCount: true,
      viewCount: true,
      isActive: true,
      isDraft: true,
      scheduledAt: true,
      createdAt: true,
      licenseVariants: true,
    },
    orderBy: [{ isDraft: "desc" }, { createdAt: "desc" }],
  });

  const serializable = songs.map((s) => ({
    id: s.id,
    title: s.title,
    coverUrl: s.coverUrl,
    genre: s.genre,
    licensePrice: Number(s.licensePrice),
    revenueSharePct: Number(s.revenueSharePct),
    totalLicenses: s.totalLicenses,
    soldLicenses: s.soldLicenses,
    streamCount: s.streamCount,
    viewCount: s.viewCount,
    isActive: s.isActive,
    isDraft: s.isDraft,
    scheduledAt: s.scheduledAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    licenseVariants: s.licenseVariants as
      | { id: string; name: string; priceUsd: number; terms?: string }[]
      | null,
  }));

  return (
    <div className="studio-room relative min-h-screen">
      <div className="relative z-[1] mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="studio-label text-white/40 hover:text-tube-400 mb-3 inline-block"
          >
            ← Control Room
          </Link>
          <div className="flex items-center gap-3">
            <span aria-hidden className="led-on-amber h-2 w-2 rounded-full" />
            <h1 className="font-display text-4xl uppercase tracking-wider text-white">
              Patch Bay
            </h1>
            <span className="studio-label ml-auto text-white/35">PB-01</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-white/55">
            Each row is a channel. Edit pricing and rev share inline, batch-route
            many tracks at once, schedule releases, or pull a track off-air.
            Changes go live the moment you save.
          </p>
        </div>

        {songs.length === 0 ? (
          <div className="rounded-xl studio-faceplate p-10 text-center">
            <p className="mb-3 text-4xl">🎙️</p>
            <p className="font-display text-xl uppercase tracking-wider text-white/85">
              No tracks routed yet
            </p>
            <p className="mt-2 text-sm text-white/45">
              Patch your first track into the studio to start earning.
            </p>
            <Link
              href="/studio/new"
              className="mt-5 inline-block rounded-md studio-faceplate px-5 py-2.5 studio-label text-tube-400 hover:text-tube-300"
            >
              + Track in
            </Link>
          </div>
        ) : (
          <ManageTracksClient initialSongs={serializable} initialFilter={filter ?? null} />
        )}
      </div>
    </div>
  );
}
