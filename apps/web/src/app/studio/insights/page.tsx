import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Studio Insights — EMS",
  description: "Track-level performance: plays, licenses, and listening trends.",
};

export default async function StudioInsightsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent("/studio/insights")}`);
  }

  const songs = await prisma.song.findMany({
    where: { artistId: session.user.id, isActive: true },
    select: {
      id: true,
      title: true,
      streamCount: true,
      soldLicenses: true,
      totalLicenses: true,
      licensePrice: true,
      aiScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const totalPlays = songs.reduce((acc, s) => acc + s.streamCount, 0);
  const totalLicenses = songs.reduce((acc, s) => acc + s.soldLicenses, 0);
  const totalRevenue = songs.reduce(
    (acc, s) => acc + s.soldLicenses * Number(s.licensePrice),
    0,
  );
  const maxPlays = Math.max(1, ...songs.map((s) => s.streamCount));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-[11px] font-black uppercase tracking-[0.32em] text-cyan-300">
        Studio Insights
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide text-white">
        Your tracks, by the numbers
      </h1>
      <p className="mt-2 text-sm text-white/65">
        Counts pulled from the catalog. Cached for 5 minutes — refresh later
        to pick up newer activity.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total plays" value={totalPlays.toLocaleString()} />
        <StatCard label="Licenses sold" value={totalLicenses.toLocaleString()} />
        <StatCard label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
      </div>

      {songs.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-white/55">
          No active tracks yet. Publish from the{" "}
          <Link className="text-cyan-300 underline" href="/studio">
            studio
          </Link>{" "}
          to see them here.
        </p>
      ) : (
        <section className="mt-8">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300/85">
            Plays per track
          </p>
          <div className="space-y-1.5">
            {songs.map((s) => (
              <PlaysRow
                key={s.id}
                title={s.title}
                streamCount={s.streamCount}
                maxPlays={maxPlays}
                soldLicenses={s.soldLicenses}
                totalLicenses={s.totalLicenses}
              />
            ))}
          </div>
        </section>
      )}

      <p className="mt-12 text-center text-xs text-white/40">
        Need deeper analysis? The{" "}
        <span className="text-tube-300">Studio Coach</span> can interpret these
        numbers — open the chat and ask &ldquo;why are my plays flat?&rdquo;.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0c0c14] to-[#0a0a12] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cyan-300/85">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-extrabold text-white">{value}</p>
    </div>
  );
}

function PlaysRow({
  title,
  streamCount,
  maxPlays,
  soldLicenses,
  totalLicenses,
}: {
  title: string;
  streamCount: number;
  maxPlays: number;
  soldLicenses: number;
  totalLicenses: number;
}) {
  // Bar widths are computed server-side and rendered as percent classes,
  // so no client JS is needed for the chart.
  const widthPct = Math.max(2, Math.round((streamCount / maxPlays) * 100));
  const licensePct = totalLicenses > 0
    ? Math.round((soldLicenses / totalLicenses) * 100)
    : 0;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-bold text-white">{title}</p>
        <p className="shrink-0 font-mono text-[11px] text-white/55">
          {streamCount.toLocaleString()} plays · {soldLicenses}/{totalLicenses} licensed
          {licensePct > 0 ? ` · ${licensePct}%` : ""}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-tube-300"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
