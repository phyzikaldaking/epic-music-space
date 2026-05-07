import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";

export const revalidate = 60;

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username },
    select: { name: true, role: true },
  });
  if (!user) return { title: "Not found" };
  const label =
    user.role === "ENGINEER" ? "Engineer" :
    user.role === "PRODUCER" ? "Producer" :
    "Pro";
  return {
    title: `${user.name ?? username} — ${label} on Epic Music Space`,
    description: `Hire ${user.name ?? username} for ${user.role === "ENGINEER" ? "mixing & mastering" : "beats & templates"}.`,
  };
}

export default async function ProProfilePage({ params }: Props) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true, name: true, image: true, username: true, role: true, createdAt: true,
    },
  });
  if (!user) notFound();
  if (user.role !== "ENGINEER" && user.role !== "PRODUCER" && user.role !== "ARTIST") {
    notFound();
  }

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

  const avgRating = ratingAgg._avg.rating ?? null;
  const totalReviews = ratingAgg._count._all;

  const roleLabel =
    user.role === "ENGINEER" ? "Engineer" :
    user.role === "PRODUCER" ? "Producer" :
    "Artist";

  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl bg-brand-500/15">
          {user.image ? (
            <Image src={user.image} alt={user.name ?? username} fill sizes="96px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold">
              {(user.name ?? username)[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold">{user.name ?? username}</h1>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
              {roleLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-white/45">@{username} · since {memberSince}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {avgRating !== null && (
              <span className="text-amber-300">
                ★ {avgRating.toFixed(1)} <span className="text-white/40">({totalReviews})</span>
              </span>
            )}
            <span className="text-white/55">{completedCount} completed</span>
            <span className="text-white/55">{listings.length} active listing{listings.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
              Stripe checkout
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/70">
              PayPal checkout
            </span>
          </div>
        </div>
      </div>

      {/* Listings */}
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/60">Services</h2>
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

      {/* Reviews */}
      {reviews.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-white/60">Reviews</h2>
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
    </div>
  );
}
