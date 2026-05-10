import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildMadeForYouRail,
  buildTasteSignal,
  type RailCandidate,
} from "@/lib/personalizedRail";
import RecommendationFeedbackButtons from "@/components/RecommendationFeedbackButtons";

interface Props {
  candidates: RailCandidate[];
}

export default async function MadeForYouRail({ candidates }: Props) {
  if (candidates.length === 0) return null;

  type RecentLicense = {
    songId: string;
    song: { genre: string | null; key: string | null; bpm: number | null };
  };
  let recentLicenses: RecentLicense[] = [];
  let viewerName: string | null = null;
  let signedIn = false;

  try {
    const session = await auth();
    if (session?.user?.id) {
      signedIn = true;
      viewerName = session.user.name ?? null;
      recentLicenses = await prisma.licenseToken.findMany({
        where: { holderId: session.user.id, status: "ACTIVE" },
        orderBy: { purchasedAt: "desc" },
        take: 50,
        select: {
          songId: true,
          song: { select: { genre: true, key: true, bpm: true } },
        },
      });
    }
  } catch {
    // Auth/DB hiccup — fall through to the cold-user path.
  }

  const signal = buildTasteSignal(recentLicenses);
  const picks = buildMadeForYouRail(candidates, signal, 6);
  if (picks.length === 0) return null;

  const isPersonalized = signedIn && (signal.genres.size > 0 || signal.bpmCentroid > 0);
  const eyebrow = isPersonalized
    ? viewerName
      ? `Made for ${viewerName.split(" ")[0]}`
      : "Made for you"
    : "Studio picks for tonight";
  const subhead = isPersonalized
    ? "Hand-scored against your license history — genre, key, and BPM affinity. Skip what doesn't hit; the rail learns."
    : "A diverse, quality-first cut of tonight's catalog. Sign in and license a track to unlock fully personalized picks.";
  const genreChips = Array.from(signal.genres.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const keyChips = Array.from(signal.keys.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  return (
    <section
      className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(108,92,231,0.10),rgba(0,0,0,0.55)_55%,rgba(34,211,238,0.08))] p-5 shadow-2xl shadow-black/45 backdrop-blur-2xl"
      aria-label={isPersonalized ? "Made for you" : "Studio picks"}
    >
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-accent-200/85">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.045em] text-white md:text-4xl md:tracking-[-0.055em]">
            {isPersonalized
              ? "Six tracks the floor thinks you'll back."
              : "Six tracks worth a spin tonight."}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{subhead}</p>
        </div>
        {!signedIn && (
          <Link
            href="/auth/signin"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent-300/35 bg-accent-300/10 px-5 text-xs font-black uppercase tracking-[0.16em] text-accent-100 transition hover:bg-accent-300/20"
          >
            Sign in to personalize
          </Link>
        )}
      </div>
      {isPersonalized && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">
            Taste signal
          </span>
          {genreChips.map(([genre, count]) => (
            <span
              key={`genre-${genre}`}
              className="rounded-full border border-accent-300/20 bg-accent-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-100"
            >
              {genre} ×{count}
            </span>
          ))}
          {keyChips.map(([key, count]) => (
            <span
              key={`key-${key}`}
              className="rounded-full border border-brand-300/20 bg-brand-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-100"
            >
              {key} ×{count}
            </span>
          ))}
          {signal.bpmCentroid > 0 && (
            <span className="rounded-full border border-gold-300/20 bg-gold-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-100">
              ~{signal.bpmCentroid} BPM
            </span>
          )}
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {picks.map((pick) => (
          <li key={pick.song.id}>
            <div className="group/pick overflow-hidden rounded-2xl border border-white/10 bg-black/40 transition hover:-translate-y-0.5 hover:border-accent-300/45 hover:shadow-2xl hover:shadow-accent-500/10">
              <Link
                href={`/track/${pick.song.id}`}
                className="block"
                aria-label={`${pick.song.title} by ${pick.song.artist} — ${pick.reason}`}
              >
                <div className="relative aspect-square overflow-hidden">
                  {pick.song.coverUrl ? (
                    <Image
                      src={pick.song.coverUrl}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 17vw"
                      className="object-cover transition duration-500 group-hover/pick:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_20%_15%,rgba(108,92,231,.45),transparent_38%),radial-gradient(circle_at_80%_70%,rgba(34,211,238,.30),transparent_36%),linear-gradient(135deg,#171126,#06080d)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                  <span className="absolute left-2 top-2 rounded-full border border-accent-300/40 bg-black/65 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-accent-100 backdrop-blur">
                    {pick.reason}
                  </span>
                </div>
              </Link>
              <div className="p-3">
                <Link href={`/track/${pick.song.id}`} className="block">
                  <p className="line-clamp-1 text-sm font-black text-white">{pick.song.title}</p>
                  <p className="line-clamp-1 text-[11px] text-white/50">{pick.song.artist}</p>
                </Link>
                <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em]">
                  <span className="text-white/55">${pick.song.licensePrice.toFixed(0)}</span>
                  <span className="text-accent-200">
                    {pick.song.revenueSharePct.toFixed(1)}% rev
                  </span>
                </div>
                <RecommendationFeedbackButtons songId={pick.song.id} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
