import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdActions from "./AdActions";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Ad Placements",
  description: "Live impressions, clicks, CTR, and flight time for your active ad placements.",
};

export default async function AdsDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/ads");

  const placements = await prisma.adPlacement.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      _count: { select: { impressions: true, clicks: true } },
    },
  });

  const now = new Date();
  const livePlacements = placements.filter((p) => p.isActive && p.startDate <= now && p.endDate >= now).length;
  const pausedPlacements = placements.filter((p) => !p.isActive && p.endDate >= now).length;
  const endedPlacements = placements.filter((p) => p.endDate < now).length;
  const totalImpressions = placements.reduce((sum, p) => sum + p._count.impressions, 0);
  const totalClicks = placements.reduce((sum, p) => sum + p._count.clicks, 0);
  const overallCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <DashboardPageHeader
        eyebrow="Placement control"
        title="My placements"
        description="Track impressions, clicks, and flight time from one place so campaigns stay easy to read and easy to act on."
        backHref="/dashboard"
        stats={[
          { label: "Live", value: livePlacements.toString(), tone: "emerald" },
          { label: "Paused", value: pausedPlacements.toString(), tone: "amber" },
          { label: "Ended", value: endedPlacements.toString(), tone: "neutral" },
          { label: "CTR", value: `${overallCtr.toFixed(2)}%`, tone: "brand" },
        ]}
        actions={
          <Link
            href="/ads"
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            New placement
          </Link>
        }
        aside={
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-300">
              Campaign snapshot
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {placements.length > 0 ? `${placements.length} placement${placements.length === 1 ? "" : "s"} on file` : "No placements yet"}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Keep the creative, timing, and placement state visible so you can pause or scale with confidence.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/65">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-white/38">Impressions</p>
                <p className="mt-1 font-semibold tabular-nums">{totalImpressions.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-white/38">Clicks</p>
                <p className="mt-1 font-semibold tabular-nums">{totalClicks.toLocaleString()}</p>
              </div>
            </div>
          </div>
        }
      />

      {placements.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-10 text-center text-sm text-white/40">
          <p className="mb-2 text-lg font-semibold text-white/80">No ad placements yet</p>
          <p className="mx-auto max-w-md">
            Once you launch a placement, this page will show the live flight, total reach, clicks, and the part where the campaign is in its lifecycle.
          </p>
          <Link href="/ads" className="mt-5 inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-600">
            Create your first placement
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {placements.map((p) => {
            const totalMs = p.endDate.getTime() - p.startDate.getTime();
            const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - p.startDate.getTime()));
            const progressPct = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
            const ctr = p._count.impressions ? (p._count.clicks / p._count.impressions) * 100 : 0;
            const live = p.isActive && p.startDate <= now && p.endDate >= now;
            const ended = p.endDate < now;

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 studio-faceplate-dark p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="relative h-24 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-white/5">
                    <Image
                      src={p.mediaUrl}
                      alt={p.title}
                      fill
                      sizes="160px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold">{p.title}</h2>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
                        {p.location.replace(/_/g, " ")}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                          ended
                            ? "border-white/15 bg-white/5 text-white/45"
                            : live
                              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                              : "border-amber-400/40 bg-amber-400/10 text-amber-300"
                        }`}
                      >
                        {ended ? "Ended" : live ? "Live" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/40">
                      {new Date(p.startDate).toLocaleDateString()} — {new Date(p.endDate).toLocaleDateString()} · ${Number(p.price).toFixed(2)}
                    </p>

                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-white/40">Impressions</p>
                        <p className="font-bold tabular-nums">{p._count.impressions.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40">Clicks</p>
                        <p className="font-bold tabular-nums">{p._count.clicks.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40">CTR</p>
                        <p className="font-bold tabular-nums">{ctr.toFixed(2)}%</p>
                      </div>
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400"
                        style={{ width: `${Math.min(100, progressPct)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-white/35">
                      {progressPct < 100 ? `${(100 - progressPct).toFixed(0)}% flight remaining` : "Flight complete"}
                    </p>
                  </div>

                  <AdActions placementId={p.id} isActive={p.isActive} ended={ended} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
