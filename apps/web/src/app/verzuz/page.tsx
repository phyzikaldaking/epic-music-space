import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { tallyRounds } from "@/lib/verzuz";

export const metadata: Metadata = {
  title: "Verzuz battles",
  description: "Live and upcoming 10-round artist showdowns on Epic Music Space.",
};

export const dynamic = "force-dynamic";

export default async function VerzuzListPage() {
  const matches = await prisma.verzuzMatch.findMany({
    where: { status: { in: ["SCHEDULED", "LIVE", "COMPLETED"] } },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 30,
    include: {
      artistA: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      artistB: {
        select: { id: true, name: true, image: true, isVerified: true, studio: { select: { username: true } } },
      },
      rounds: { select: { winner: true } },
      _count: { select: { votes: true } },
    },
  });

  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  const past = matches.filter((m) => m.status === "COMPLETED");

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(circle_at_15%_20%,rgba(124,58,237,0.4),transparent_55%),radial-gradient(circle_at_85%_30%,rgba(0,245,255,0.32),transparent_55%)]"
      />
      <div className="relative mx-auto max-w-5xl px-4 py-10">
        <div className="ems-head mb-8 text-center">
          <p className="ems-kicker text-gold-200">Verzuz Events</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
            <span className="text-gradient-ems">10-round artist showdowns.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-2xl ems-sub">
            Two artists, ten songs each, head-to-head. Fans vote round-by-round.
            Whoever wins the most rounds takes the match.
          </p>
          <div className="mx-auto mt-3 h-px w-full max-w-2xl bg-gradient-to-r from-gold-400/30 via-white/20 to-cyan-300/30" aria-hidden />
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href="/verzuz/new"
              className="rounded-xl bg-gold-500 px-6 py-2.5 text-sm font-black uppercase tracking-widest text-[#0a0a0a] hover:bg-gold-400"
            >
              Stage a Verzuz →
            </Link>
            <Link
              href="/versus"
              className="rounded-xl border border-white/15 bg-white/4 px-6 py-2.5 text-sm font-bold text-white/85 hover:bg-white/8"
            >
              1v1 + Royale
            </Link>
          </div>
        </div>

        {live.length > 0 && (
          <Section title="🔴 Live now" matches={live} />
        )}
        {upcoming.length > 0 && (
          <Section title="📅 Scheduled" matches={upcoming} />
        )}
        {past.length > 0 && (
          <Section title="🏆 Recent results" matches={past} compact />
        )}

        {matches.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/4 p-12 text-center">
            <p className="text-5xl">🎤</p>
            <p className="mt-3 text-lg font-bold">No Verzuz matches yet.</p>
            <p className="mt-1 text-sm text-white/55">
              Be the first — pick your opponent + setlist on the next page.
            </p>
            <Link
              href="/verzuz/new"
              className="mt-5 inline-block rounded-xl bg-gold-500 px-5 py-2 text-sm font-black uppercase tracking-widest text-[#0a0a0a] hover:bg-gold-400"
            >
              Stage the first one →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

interface MatchRow {
  id: string;
  artistAName: string;
  artistBName: string;
  theme: string | null;
  status: string;
  totalRounds: number;
  startsAt: Date;
  artistA: { image: string | null; isVerified: boolean; studio: { username: string } | null };
  artistB: { image: string | null; isVerified: boolean; studio: { username: string } | null };
  rounds: { winner: string | null }[];
  _count: { votes: number };
}

function Section({ title, matches, compact = false }: { title: string; matches: MatchRow[]; compact?: boolean }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-sm font-black uppercase tracking-[0.24em] text-white/55">{title}</h2>
      <div className={`grid gap-4 ${compact ? "sm:grid-cols-2" : "md:grid-cols-2"}`}>
        {matches.map((m) => {
          const score = tallyRounds(m.rounds);
          const aWon = score.aWins > score.bWins;
          const tied = score.aWins === score.bWins && m.status === "COMPLETED";
          return (
            <Link
              key={m.id}
              href={`/verzuz/${m.id}`}
              className={`group relative overflow-hidden rounded-2xl border p-4 transition ${
                m.status === "LIVE"
                  ? "border-red-500/45 bg-red-500/8 hover:bg-red-500/12"
                  : "border-white/10 bg-white/4 hover:bg-white/8"
              }`}
            >
              {m.status === "LIVE" && (
                <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500/85 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Live
                </span>
              )}
              <div className="flex items-center gap-3">
                <ArtistChip name={m.artistAName} image={m.artistA.image} verified={m.artistA.isVerified} />
                <span className="text-xs font-black text-white/35">vs</span>
                <ArtistChip name={m.artistBName} image={m.artistB.image} verified={m.artistB.isVerified} />
              </div>
              {m.theme && (
                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-white/55">
                  {m.theme}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                <span>
                  {m.totalRounds} rounds · {m._count.votes} {m._count.votes === 1 ? "vote" : "votes"}
                </span>
                {m.status === "COMPLETED" ? (
                  <span className="font-black text-gold-200">
                    {tied ? `Tied ${score.aWins}-${score.bWins}` : `${aWon ? m.artistAName : m.artistBName} took it`}
                  </span>
                ) : (
                  <span className="font-bold text-white/65">
                    {new Date(m.startsAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ArtistChip({
  name,
  image,
  verified,
}: {
  name: string;
  image: string | null;
  verified: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500">
        {image ? (
          <Image src={image} alt="" fill unoptimized className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-base">🎤</span>
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-bold">
        {name}
        {verified && <span className="ml-1 text-cyan-300">✓</span>}
      </p>
    </div>
  );
}
