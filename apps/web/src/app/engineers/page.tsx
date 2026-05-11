import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseAccolades, ACCOLADE_BADGE } from "@/lib/proProfile";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Find a Mixing or Mastering Engineer — Epic Music Space",
  description:
    "Browse Grammy-winning and independent mixing & mastering engineers. Hire directly, pay through Stripe, and get radio-ready sound.",
  openGraph: {
    title: "Hire Engineers — Epic Music Space",
    description:
      "Grammy-winning mixing & mastering engineers ready to work on your record.",
  },
};

export default async function EngineersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; specialty?: string }>;
}) {
  const { q, specialty } = await searchParams;

  // Engineer Mode — verified EngineerProfile rows with active
  // ENGINEER_MIX / ENGINEER_MASTER VerseListings. Surfaced above the
  // legacy ServiceListing grid so the live virtual-studio sessions
  // headline the page.
  const engineerProfiles = await prisma.engineerProfile.findMany({
    where: { verifiedAt: { not: null }, isAcceptingWork: true },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          coverImage: true,
          headline: true,
          isVerified: true,
          verseListings: {
            where: {
              status: "ACTIVE",
              kind: { in: ["ENGINEER_MIX", "ENGINEER_MASTER"] },
            },
            select: {
              id: true,
              kind: true,
              title: true,
              priceUsd: true,
              sessionMinutes: true,
              deliveryDays: true,
            },
            take: 4,
          },
        },
      },
    },
    orderBy: { verifiedAt: "desc" },
    take: 12,
  });
  const studioCards = engineerProfiles.filter(
    (p) => p.user.verseListings.length > 0,
  );

  const engineers = await prisma.user.findMany({
    where: {
      role: "ENGINEER",
      proProfilePublished: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
              { headline: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ isVerified: "desc" }, { grammyWins: "desc" }, { createdAt: "desc" }],
    take: 48,
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      coverImage: true,
      isVerified: true,
      headline: true,
      location: true,
      yearsExperience: true,
      grammyWins: true,
      grammyNominations: true,
      riaaPlatinum: true,
      riaaGold: true,
      billboardNumberOne: true,
      engineerAccolades: true,
      _count: { select: { followers: true } },
    },
  });

  // Pull live service listings for each engineer so we can show "from $X"
  const engineerIds = engineers.map((e) => e.id);
  const listings = engineerIds.length
    ? await prisma.serviceListing.findMany({
        where: {
          providerId: { in: engineerIds },
          status: "LIVE",
          kind: { in: ["MIX", "MASTER", "MIX_MASTER_BUNDLE", "LESSON"] },
        },
        select: { providerId: true, kind: true, priceUsd: true },
        orderBy: { priceUsd: "asc" },
      })
    : [];

  const listingMap = new Map<string, (typeof listings)[number][]>();
  for (const l of listings) {
    const arr = listingMap.get(l.providerId) ?? [];
    arr.push(l);
    listingMap.set(l.providerId, arr);
  }

  const SPECIALTIES = ["Mix", "Master", "Mix + Master", "Lesson / 1:1"];
  const specialtyKind =
    specialty === "Mix"
      ? "MIX"
      : specialty === "Master"
        ? "MASTER"
        : specialty === "Mix + Master"
          ? "MIX_MASTER_BUNDLE"
          : specialty === "Lesson / 1:1"
            ? "LESSON"
            : null;
  const visibleEngineers = specialtyKind
    ? engineers.filter((eng) => (listingMap.get(eng.id) ?? []).some((l) => l.kind === specialtyKind))
    : engineers;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
            Hire an engineer
          </p>
          <h1 className="text-4xl font-extrabold">
            Find Your Sound Engineer
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            Grammy-winning to indie-hungry — book mixing, mastering, and lessons
            directly from working engineers. All payments secured through Stripe.
          </p>
        </div>
        <Link
          href="/pro/edit"
          className="flex-shrink-0 rounded-xl border border-brand-500/50 bg-brand-500/15 px-5 py-2.5 text-sm font-bold text-brand-300 hover:bg-brand-500/25"
        >
          Are you an engineer? → Set up your profile
        </Link>
      </div>

      {/* Engineer Mode — live virtual-studio sessions. */}
      {studioCards.length > 0 && (
        <section className="mb-12 rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-500/[0.08] via-violet-500/[0.04] to-transparent p-6 shadow-2xl shadow-cyan-500/10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300">
                Engineer Mode · Live virtual studio
              </p>
              <h2 className="mt-1 text-2xl font-extrabold">
                Book a 1-hour mix session with a verified pro
              </h2>
              <p className="mt-1 max-w-xl text-sm text-white/60">
                Pay through Stripe escrow. Both parties meet in a live studio
                room — the engineer mixes your track on screen, you sign off
                when it sounds right, funds release.
              </p>
            </div>
            <Link
              href="/engineers/list"
              className="rounded-full border border-cyan-400/50 bg-cyan-500/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/25"
            >
              List as engineer
            </Link>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {studioCards.map((p) => (
              <li
                key={p.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-black/40"
              >
                <div className="relative h-20">
                  {p.user.coverImage ? (
                    <Image
                      src={p.user.coverImage}
                      alt=""
                      fill
                      sizes="400px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/30 via-violet-500/15 to-transparent" />
                  )}
                </div>
                <div className="-mt-7 px-4 pb-4">
                  <div className="flex items-end gap-3">
                    {p.user.image ? (
                      <Image
                        src={p.user.image}
                        alt={p.user.name ?? ""}
                        width={56}
                        height={56}
                        className="rounded-xl border-2 border-black object-cover"
                      />
                    ) : (
                      <div className="grid h-14 w-14 place-items-center rounded-xl border-2 border-black bg-gradient-to-br from-cyan-600 to-violet-600 text-lg font-extrabold">
                        {(p.user.name ?? "?")[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="truncate font-bold">
                        {p.user.name ?? p.user.username}
                        {p.user.isVerified && (
                          <span className="ml-1 text-cyan-300">✓</span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-white/55">
                        {p.tagline ?? p.user.headline ?? "Pro audio engineer"}
                      </p>
                    </div>
                  </div>
                  {p.specialties.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      {p.specialties.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-white/65"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <ul className="mt-3 space-y-1.5">
                    {p.user.verseListings.map((v) => (
                      <li key={v.id}>
                        <Link
                          href={`/market/listing/${v.id}`}
                          className="flex items-center justify-between rounded-md border border-white/10 bg-black/50 px-3 py-2 text-xs transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                                v.kind === "ENGINEER_MIX"
                                  ? "bg-cyan-500/20 text-cyan-200"
                                  : "bg-violet-500/20 text-violet-200"
                              }`}
                            >
                              {v.kind === "ENGINEER_MIX" ? "Mix" : "Master"}
                            </span>
                            <span className="truncate">{v.title}</span>
                          </span>
                          <span className="ml-2 font-extrabold tabular-nums text-emerald-300">
                            ${Number(v.priceUsd).toFixed(0)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded-md bg-black/40 px-2 py-1">
                      <p className="text-white/40">Turnaround</p>
                      <p className="font-black">{p.turnaroundHours}h</p>
                    </div>
                    <div className="rounded-md bg-black/40 px-2 py-1">
                      <p className="text-white/40">Max rate</p>
                      <p className="font-black">
                        {Math.round(p.maxSampleRate / 1000)}k
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search + specialty filter */}
      <form method="GET" className="mb-8 flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or keyword…"
          className="w-full max-w-sm rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-brand-500/60 focus:outline-none"
        />
        <div className="flex flex-wrap gap-2">
          {SPECIALTIES.map((s) => (
            <button
              key={s}
              type="submit"
              name="specialty"
              value={s === specialty ? "" : s}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                specialty === s
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                  : "border-white/10 text-white/55 hover:border-white/25 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {visibleEngineers.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-12 text-center">
          <p className="text-lg font-semibold text-white/60">No engineers found.</p>
          <p className="mt-2 text-sm text-white/35">
            {q || specialty
              ? "Try a different search term or specialty."
              : "Be the first — set up your engineer profile."}
          </p>
          <Link
            href="/pro/edit"
            className="mt-6 inline-block rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
          >
            Set up profile
          </Link>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleEngineers.map((eng) => {
          const accolades = parseAccolades(eng.engineerAccolades);
          const engineerListings = listingMap.get(eng.id) ?? [];
          const minPrice = engineerListings.length
            ? Math.min(...engineerListings.map((l) => Number(l.priceUsd)))
            : null;
          const hasEliteAward =
            eng.grammyWins > 0 || eng.grammyNominations > 0 || eng.riaaPlatinum > 0;

          return (
            <Link
              key={eng.id}
              href={`/pro/${eng.username}`}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-brand-500/40 hover:bg-white/[0.06]"
            >
              {/* Cover / gradient banner */}
              <div className="relative h-28 w-full overflow-hidden">
                {eng.coverImage ? (
                  <Image
                    src={eng.coverImage}
                    alt=""
                    fill
                    sizes="400px"
                    className="object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 via-black to-accent-900/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

                {/* Elite glow */}
                {hasEliteAward && (
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(251,191,36,0.25),transparent_60%)]"
                  />
                )}

                {/* Grammy / RIAA badge */}
                {eng.grammyWins > 0 && (
                  <span className="absolute right-3 top-3 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 text-[10px] font-extrabold text-amber-200">
                    🏆 Grammy ×{eng.grammyWins}
                  </span>
                )}
                {eng.grammyWins === 0 && eng.grammyNominations > 0 && (
                  <span className="absolute right-3 top-3 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-extrabold text-amber-100">
                    🎼 Nominated
                  </span>
                )}
              </div>

              {/* Avatar */}
              <div className="-mt-8 px-4">
                <div className="relative inline-block">
                  {hasEliteAward && (
                    <div
                      aria-hidden
                      className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-amber-400/40 via-fuchsia-500/30 to-cyan-400/30 blur-sm"
                    />
                  )}
                  {eng.image ? (
                    <Image
                      src={eng.image}
                      alt={eng.name ?? eng.username ?? ""}
                      width={56}
                      height={56}
                      className="relative rounded-2xl border-2 border-black object-cover"
                    />
                  ) : (
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-black bg-gradient-to-br from-brand-600 to-accent-600 text-xl font-extrabold text-white">
                      {(eng.name ?? eng.username ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4 pt-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">
                      {eng.name ?? eng.username}
                      {eng.isVerified && (
                        <span className="ml-1.5 text-brand-400" title="Verified">✓</span>
                      )}
                    </p>
                    {eng.headline && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-white/55">{eng.headline}</p>
                    )}
                  </div>
                  {minPrice !== null && (
                    <span className="flex-shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">
                      from ${minPrice}
                    </span>
                  )}
                </div>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/40">
                  {eng.location && <span>{eng.location}</span>}
                  {eng.yearsExperience != null && (
                    <span>{eng.yearsExperience}+ yrs</span>
                  )}
                  <span>{eng._count.followers} followers</span>
                </div>

                {/* Accolades row */}
                {accolades.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {accolades.slice(0, 3).map((a) => (
                      <span
                        key={`${a.kind}-${a.title}-${a.year ?? "na"}`}
                        className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                      >
                        {ACCOLADE_BADGE[a.kind]?.emoji ?? "🎵"} {a.title}
                      </span>
                    ))}
                    {accolades.length > 3 && (
                      <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/35">
                        +{accolades.length - 3} more
                      </span>
                    )}
                  </div>
                )}

                {/* Service kinds offered */}
                {engineerListings.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {Array.from(new Set(engineerListings.map((l) => l.kind)))
                      .slice(0, 3)
                      .map((k) => (
                        <span
                          key={k}
                          className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300"
                        >
                          {k === "MIX" ? "Mix" : k === "MASTER" ? "Master" : k === "MIX_MASTER_BUNDLE" ? "Mix+Master" : "Lesson"}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* CTA for engineers to join */}
      <div className="mt-16 rounded-2xl border border-brand-500/25 bg-brand-500/5 p-8 text-center">
        <p className="text-2xl font-extrabold">Are you an engineer?</p>
        <p className="mt-2 max-w-md mx-auto text-sm text-white/55">
          List your mixing, mastering, and lesson services on Epic Music Space.
          Get paid through Stripe. Build your professional credits page. Share
          your profile on social.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/signup"
            className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white hover:bg-brand-600"
          >
            Join as an engineer
          </Link>
          <Link
            href="/pro/edit"
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-white/80 hover:border-white/40"
          >
            Set up your pro profile →
          </Link>
        </div>
      </div>
    </div>
  );
}
