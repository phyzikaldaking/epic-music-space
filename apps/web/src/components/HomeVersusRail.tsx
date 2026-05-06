import Link from "next/link";
import Image from "next/image";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cacheTags";

const getActiveBattlesForRail = unstable_cache(
  async () => {
    const songSelect = {
      id: true,
      title: true,
      artist: true,
      coverUrl: true,
    } as const;
    return prisma.versusMatch.findMany({
      where: { status: "ACTIVE", endsAt: { gt: new Date() } },
      include: { songA: { select: songSelect }, songB: { select: songSelect } },
      orderBy: { endsAt: "asc" },
      take: 6,
    });
  },
  ["home-versus-rail-v1"],
  { revalidate: 30, tags: [CACHE_TAGS.battles] },
);

function formatTimeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "Closing";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}

function leadPercent(votesA: number, votesB: number): { a: number; b: number } {
  const total = Math.max(1, votesA + votesB);
  return { a: Math.round((votesA / total) * 100), b: Math.round((votesB / total) * 100) };
}

export default async function HomeVersusRail() {
  let battles: Awaited<ReturnType<typeof getActiveBattlesForRail>> = [];
  try {
    battles = await getActiveBattlesForRail();
  } catch {
    // Database hiccup — silently hide the rail rather than blow up the home page.
    return null;
  }
  if (battles.length === 0) return null;

  return (
    <section className="vc-section" aria-label="Live Versus battles">
      <div className="vc-container">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200/85">
              Live Versus battles
            </p>
            <h2 className="mt-2 text-3xl font-black leading-[1.05] tracking-[-0.04em] text-white md:text-5xl md:tracking-[-0.055em]">
              Vote a track into the charts —{" "}
              <span className="text-gradient-ems">tonight.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55 md:text-base">
              Two artists, one round, the room decides. Every tap shifts the
              leaderboard in real time. No playlist gatekeepers, no algorithm
              hiding your vote — the count is public.
            </p>
          </div>
          <Link
            href="/versus"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-200/10 px-6 text-xs font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-cyan-200/20"
          >
            See every battle →
          </Link>
        </div>

        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {battles.map((m) => {
            const lead = leadPercent(m.votesA, m.votesB);
            const aLeading = m.votesA > m.votesB;
            const bLeading = m.votesB > m.votesA;
            return (
              <li
                key={m.id}
                className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(140deg,rgba(34,211,238,0.08),rgba(0,0,0,0.5)_55%,rgba(253,224,71,0.06))] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200/40"
              >
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.22em]">
                  <span className="rounded-full border border-rose-300/35 bg-rose-300/10 px-2.5 py-1 text-rose-100">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300 align-middle" />
                    Live
                  </span>
                  <span className="text-white/45">{formatTimeLeft(m.endsAt)}</span>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <BattleSide
                    title={m.songA.title}
                    artist={m.songA.artist}
                    coverUrl={m.songA.coverUrl}
                    leading={aLeading}
                    align="left"
                  />
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/60 text-[10px] font-black uppercase tracking-[0.14em] text-white/65">
                    VS
                  </span>
                  <BattleSide
                    title={m.songB.title}
                    artist={m.songB.artist}
                    coverUrl={m.songB.coverUrl}
                    leading={bLeading}
                    align="right"
                  />
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
                    <span className={aLeading ? "text-cyan-200" : ""}>
                      {lead.a}% · {m.votesA.toLocaleString()}
                    </span>
                    <span className={bLeading ? "text-gold-200" : ""}>
                      {m.votesB.toLocaleString()} · {lead.b}%
                    </span>
                  </div>
                  <div
                    className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={lead.a}
                    aria-label={`${m.songA.title} leads ${lead.a}% versus ${m.songB.title} ${lead.b}%`}
                  >
                    <div
                      className="h-full bg-gradient-to-r from-cyan-300 via-white/80 to-gold-300"
                      style={{ width: `${Math.max(2, Math.min(98, lead.a))}%` }}
                    />
                  </div>
                </div>

                <Link
                  href={`/versus/${m.id}`}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-cyan-200"
                  aria-label={`Vote in battle: ${m.songA.title} versus ${m.songB.title}`}
                >
                  Cast your vote →
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function BattleSide({
  title,
  artist,
  coverUrl,
  leading,
  align,
}: {
  title: string;
  artist: string;
  coverUrl: string | null;
  leading: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div
        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border ${
          leading ? "border-cyan-200/55 shadow-lg shadow-cyan-500/20" : "border-white/10"
        }`}
      >
        {coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="56px" className="object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(108,92,231,0.4),transparent_55%),linear-gradient(135deg,#0a0a14,#000)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-black text-white">{title}</p>
        <p className="line-clamp-1 text-xs text-white/50">{artist}</p>
      </div>
    </div>
  );
}
