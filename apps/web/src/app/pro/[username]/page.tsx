import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";
import {
  parseCredits,
  parseAccolades,
  parseGear,
  ACCOLADE_BADGE,
} from "@/lib/proProfile";

export const revalidate = 60;

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, role: true, headline: true, image: true, coverImage: true },
  });
  if (!user) return { title: "Not found" };
  const label =
    user.role === "ENGINEER" ? "Engineer" :
    user.role === "PRODUCER" ? "Producer" :
    "Pro";
  const title = `${user.name ?? username} — ${label} on Epic Music Space`;
  const description =
    user.headline ??
    `Hire ${user.name ?? username} for ${user.role === "ENGINEER" ? "mixing & mastering" : "beats & templates"}.`;
  const ogImage = user.coverImage ?? user.image ?? undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function ProProfilePage({ params }: Props) {
  const { username } = await params;
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, name: true, image: true, username: true, role: true, createdAt: true,
      isVerified: true,
      headline: true, bioLong: true, coverImage: true, location: true,
      websiteUrl: true, instagramUrl: true, twitterUrl: true,
      youtubeUrl: true, tiktokUrl: true, spotifyUrl: true,
      grammyNominations: true, grammyWins: true,
      riaaPlatinum: true, riaaGold: true, billboardNumberOne: true,
      yearsExperience: true,
      engineerCredits: true, engineerAccolades: true, engineerGear: true,
    },
  });
  if (!user) notFound();
  if (user.role !== "ENGINEER" && user.role !== "PRODUCER" && user.role !== "ARTIST") {
    notFound();
  }

  const isOwner = session?.user?.id === user.id;

  const [listings, reviews, completedCount, ratingAgg] = await Promise.all([
    prisma.serviceListing.findMany({
      where: { providerId: user.id, status: "LIVE" },
      orderBy: [{ totalSold: "desc" }, { createdAt: "desc" }],
      take: 24,
    }),
    prisma.serviceReview.findMany({
      where: { providerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        buyer: { select: { name: true, image: true } },
        listing: { select: { title: true } },
      },
    }),
    prisma.serviceOrder.count({
      where: { providerId: user.id, status: "COMPLETED" },
    }),
    prisma.serviceReview.aggregate({
      where: { providerId: user.id },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const credits = parseCredits(user.engineerCredits);
  const accolades = parseAccolades(user.engineerAccolades);
  const gear = parseGear(user.engineerGear);

  const avgRating = ratingAgg._avg.rating ?? null;
  const totalReviews = ratingAgg._count._all;

  const roleLabel =
    user.role === "ENGINEER" ? "Engineer" :
    user.role === "PRODUCER" ? "Producer" :
    "Artist";

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short",
  });

  const totalAwards =
    user.grammyWins + user.grammyNominations +
    user.riaaPlatinum + user.riaaGold +
    user.billboardNumberOne;

  // Marquee numbers — surface highest-impact accolade as a halo around the avatar.
  const isElite = user.grammyWins > 0 || user.grammyNominations > 0 || user.riaaPlatinum > 0;

  return (
    <div className="relative min-h-screen">
      {/* ── Cinematic hero banner ──────────────────────────── */}
      <div className="relative h-[44vh] min-h-[320px] w-full overflow-hidden">
        {user.coverImage ? (
          <Image
            src={user.coverImage}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 via-black to-accent-900/40" />
        )}
        {/* Heavy overlay so the avatar/text always reads */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,rgba(168,85,247,0.18),transparent_55%),radial-gradient(circle_at_75%_30%,rgba(56,189,248,0.12),transparent_55%)]" />

        {isOwner && (
          <Link
            href="/pro/edit"
            className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-black/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/90 backdrop-blur hover:border-white/50"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* ── Floating identity card on top of the banner ─────── */}
      <div className="mx-auto -mt-28 max-w-6xl px-4 sm:-mt-32">
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          {/* Avatar with elite halo */}
          <div className="relative flex-shrink-0">
            {isElite && (
              <div
                aria-hidden
                className="absolute -inset-2 rounded-3xl bg-gradient-to-br from-amber-400/40 via-fuchsia-500/30 to-cyan-400/30 blur-md"
              />
            )}
            <div className="relative h-40 w-40 overflow-hidden rounded-3xl border-4 border-black/80 bg-brand-500/15 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] sm:h-44 sm:w-44">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? username}
                  fill
                  sizes="(max-width: 640px) 160px, 176px"
                  priority
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-6xl font-bold">
                  {(user.name ?? username)[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Identity column */}
          <div className="min-w-0 flex-1 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">
                {roleLabel}
              </span>
              {user.isVerified && (
                <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-200">
                  ✓ Verified
                </span>
              )}
              {user.grammyWins > 0 && (
                <span className="rounded-full border border-amber-400/50 bg-gradient-to-r from-amber-400/20 to-yellow-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-200">
                  🏆 {user.grammyWins}× Grammy Win
                </span>
              )}
              {user.grammyNominations > 0 && user.grammyWins === 0 && (
                <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-100">
                  🎼 {user.grammyNominations}× Grammy Nominated
                </span>
              )}
              {user.riaaPlatinum > 0 && (
                <span className="rounded-full border border-slate-200/30 bg-slate-200/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-100">
                  💿 {user.riaaPlatinum}× Platinum
                </span>
              )}
            </div>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {user.name ?? username}
            </h1>
            {user.headline && (
              <p className="mt-2 max-w-2xl text-lg font-medium text-white/85 sm:text-xl">
                {user.headline}
              </p>
            )}
            <p className="mt-2 text-sm text-white/45">
              @{username}
              {user.location && <> · {user.location}</>}
              {" · "}since {memberSince}
              {user.yearsExperience !== null && user.yearsExperience !== undefined && (
                <> · {user.yearsExperience}+ yrs experience</>
              )}
            </p>
          </div>

          {/* CTA card */}
          <div className="hidden w-72 flex-shrink-0 rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              Hire on EMS
            </p>
            <div className="mt-2 flex items-baseline gap-3 text-sm">
              {avgRating !== null ? (
                <span className="text-amber-300">
                  ★ <span className="font-bold">{avgRating.toFixed(1)}</span>
                  <span className="ml-1 text-white/40">({totalReviews})</span>
                </span>
              ) : (
                <span className="text-white/45">No reviews yet</span>
              )}
              <span className="text-white/55">{completedCount} completed</span>
            </div>
            <Link
              href={`/services?provider=${username}`}
              className="mt-4 block w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-2.5 text-center text-sm font-bold text-white shadow-lg shadow-brand-500/30 transition hover:from-brand-400 hover:to-accent-400"
            >
              See {listings.length} service{listings.length === 1 ? "" : "s"}
            </Link>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="mx-auto mt-12 max-w-6xl px-4 pb-20">
        {/* ── Marquee accolades wall ─────────────────────── */}
        {totalAwards > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              Accolades
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {[
                { value: user.grammyWins,         label: "Grammy Wins",     emoji: "🏆", show: user.grammyWins > 0 },
                { value: user.grammyNominations,  label: "Grammy Noms",     emoji: "🎼", show: user.grammyNominations > 0 },
                { value: user.riaaPlatinum,       label: "Platinum",        emoji: "💿", show: user.riaaPlatinum > 0 },
                { value: user.riaaGold,           label: "Gold",            emoji: "🥇", show: user.riaaGold > 0 },
                { value: user.billboardNumberOne, label: "Billboard #1",    emoji: "📈", show: user.billboardNumberOne > 0 },
              ]
                .filter((m) => m.show)
                .map((m) => (
                  <div
                    key={m.label}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-5 text-center"
                  >
                    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_60%)]" />
                    <div className="relative">
                      <div className="text-3xl">{m.emoji}</div>
                      <div className="mt-2 text-3xl font-extrabold tracking-tight">{m.value}</div>
                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                        {m.label}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ── Bio ─────────────────────────────────────────── */}
        {user.bioLong && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              About
            </h2>
            <p className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-white/80">
              {user.bioLong}
            </p>
          </section>
        )}

        {/* ── Selected Credits ────────────────────────────── */}
        {credits.length > 0 && (
          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
                Selected Credits
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                {credits.length} record{credits.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {credits.map((c, idx) => (
                <div
                  key={`${c.artist}-${c.title}-${idx}`}
                  className="group relative flex gap-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d14] p-3 transition hover:border-white/25"
                >
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-brand-900/40 to-accent-900/30">
                    {c.coverUrl ? (
                      <Image src={c.coverUrl} alt={`${c.artist} — ${c.title}`} fill sizes="80px" className="object-cover transition group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl">🎵</div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate text-base font-extrabold">{c.artist}</p>
                    <p className="truncate text-sm text-white/65">{c.title}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-widest text-white/40">
                      {c.role}{c.year ? ` · ${c.year}` : ""}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.isGrammyWin && <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">🏆 GRAMMY</span>}
                      {!c.isGrammyWin && c.isGrammyNominated && <span className="rounded bg-amber-300/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-100">🎼 NOM</span>}
                      {c.isPlatinum && <span className="rounded bg-slate-200/15 px-1.5 py-0.5 text-[9px] font-bold text-slate-100">💿 PLAT</span>}
                      {c.isGold && <span className="rounded bg-yellow-500/15 px-1.5 py-0.5 text-[9px] font-bold text-yellow-100">🥇 GOLD</span>}
                      {c.isBillboardNumberOne && <span className="rounded bg-rose-400/15 px-1.5 py-0.5 text-[9px] font-bold text-rose-100">📈 #1</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Awards / Accolades list ─────────────────────── */}
        {accolades.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              Awards &amp; Recognition
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {accolades.map((a, idx) => {
                const meta = ACCOLADE_BADGE[a.kind];
                return (
                  <li
                    key={`${a.title}-${idx}`}
                    className={`flex items-start gap-3 rounded-xl border bg-gradient-to-r ${meta.tint} p-3`}
                  >
                    <span className="text-lg" aria-hidden>{meta.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{a.title}</p>
                      <p className="text-[11px] uppercase tracking-widest opacity-70">
                        {meta.label}{a.org ? ` · ${a.org}` : ""}{a.year ? ` · ${a.year}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── Studio / gear ──────────────────────────────── */}
        {(gear.console || gear.monitors || (gear.daws?.length ?? 0) > 0 || (gear.plugins?.length ?? 0) > 0 || (gear.outboard?.length ?? 0) > 0) && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              Studio &amp; Gear
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {gear.console && (
                <GearRow label="Console" value={gear.console} />
              )}
              {gear.monitors && (
                <GearRow label="Monitors" value={gear.monitors} />
              )}
              {(gear.daws?.length ?? 0) > 0 && (
                <GearChips label="DAWs" items={gear.daws ?? []} />
              )}
              {(gear.plugins?.length ?? 0) > 0 && (
                <GearChips label="Plugins" items={gear.plugins ?? []} />
              )}
              {(gear.outboard?.length ?? 0) > 0 && (
                <GearChips label="Outboard" items={gear.outboard ?? []} />
              )}
              {gear.roomTreatment && (
                <GearRow label="Room" value={gear.roomTreatment} />
              )}
            </div>
          </section>
        )}

        {/* ── Listings ────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
            Services
          </h2>
          {listings.length === 0 ? (
            <p className="rounded-2xl border border-white/8 bg-white/3 px-5 py-12 text-center text-sm text-white/40">
              No active listings.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((s) => {
                const meta = SERVICE_KIND_META[s.kind];
                return (
                  <Link
                    key={s.id}
                    href={`/services/${s.id}`}
                    className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#0d0d14] p-4 transition hover:border-brand-500/40"
                  >
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-900/40 to-accent-900/20">
                      {s.coverUrl ? (
                        <Image src={s.coverUrl} alt={s.title} fill sizes="(max-width: 1024px) 100vw, 33vw" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-5xl">{meta.badge}</div>
                      )}
                      <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
                        {meta.label}
                      </span>
                    </div>
                    <h3 className="line-clamp-2 text-sm font-bold">{s.title}</h3>
                    <div className="mt-auto flex items-center justify-between text-xs">
                      <span className="text-white/40">
                        {meta.isInstant ? "Instant download" : `${s.deliveryDays}d delivery`}
                      </span>
                      <span className="font-bold text-brand-300">${Number(s.priceUsd).toFixed(2)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Reviews ─────────────────────────────────────── */}
        {reviews.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              Reviews
            </h2>
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-white/8 bg-[#0d0d14] p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
                      {r.buyer.image ? (
                        <Image src={r.buyer.image} alt={r.buyer.name ?? ""} fill sizes="32px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                          {(r.buyer.name ?? "?")[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{r.buyer.name ?? "Buyer"}</p>
                      <p className="text-xs text-white/40">{new Date(r.createdAt).toLocaleDateString()} · {r.listing.title}</p>
                    </div>
                    <span className="ml-auto text-amber-300">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  </div>
                  {r.body && <p className="mt-2 text-sm text-white/75">{r.body}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Social / Web links ──────────────────────────── */}
        {(user.websiteUrl || user.instagramUrl || user.twitterUrl || user.youtubeUrl || user.tiktokUrl || user.spotifyUrl) && (
          <section className="mb-4">
            <h2 className="mb-4 text-[10px] font-extrabold uppercase tracking-[0.3em] text-white/45">
              Connect
            </h2>
            <div className="flex flex-wrap gap-2">
              <SocialPill href={user.websiteUrl}    label="Website"    emoji="🔗" />
              <SocialPill href={user.instagramUrl}  label="Instagram"  emoji="📸" />
              <SocialPill href={user.twitterUrl}    label="Twitter / X" emoji="𝕏" />
              <SocialPill href={user.youtubeUrl}    label="YouTube"    emoji="▶️" />
              <SocialPill href={user.tiktokUrl}     label="TikTok"     emoji="🎬" />
              <SocialPill href={user.spotifyUrl}    label="Spotify"    emoji="🎧" />
            </div>
          </section>
        )}

        {/* Mobile-only CTA pinned at the bottom of the column */}
        <div className="sticky bottom-4 z-10 mt-10 sm:hidden">
          <Link
            href={`/services?provider=${username}`}
            className="block w-full rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-center text-base font-extrabold text-white shadow-2xl shadow-brand-500/30"
          >
            See {listings.length} service{listings.length === 1 ? "" : "s"} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function GearRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-1 text-sm text-white/85">{value}</p>
    </div>
  );
}

function GearChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-white/80">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SocialPill({ href, label, emoji }: { href: string | null; label: string; emoji: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/35 hover:bg-white/10"
    >
      <span className="mr-1.5" aria-hidden>{emoji}</span>
      {label}
    </a>
  );
}
