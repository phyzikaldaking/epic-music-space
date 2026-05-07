import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";
import BuyServiceButton from "./BuyServiceButton";
import CompactAudioPlayer from "@/components/CompactAudioPlayer";

export const revalidate = 30;

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, listing] = await Promise.all([
    auth(),
    prisma.serviceListing.findUnique({
      where: { id },
      include: {
        provider: { select: { id: true, name: true, image: true, username: true, role: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { buyer: { select: { name: true, image: true } } },
        },
      },
    }),
  ]);
  if (!listing) notFound();

  const meta = SERVICE_KIND_META[listing.kind];
  const isOwner = session?.user?.id === listing.providerId;
  const paypalEnabled = Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim());

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: cover + description */}
        <div>
          <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900/40 to-accent-900/20">
            {listing.coverUrl ? (
              <Image src={listing.coverUrl} alt={listing.title} fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-7xl">{meta.badge}</div>
            )}
            <span className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white/80">
              {meta.label}
            </span>
          </div>

          <h1 className="mt-6 text-3xl font-extrabold">{listing.title}</h1>

          <div className="mt-3 flex items-center gap-3">
            <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-white/10">
              {listing.provider.image ? (
                <Image src={listing.provider.image} alt={listing.provider.name ?? ""} fill sizes="32px" className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                  {(listing.provider.name ?? "?")[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {listing.provider.username ? (
                  <Link href={`/pro/${listing.provider.username}`} className="text-brand-300 hover:underline">
                    {listing.provider.name ?? listing.provider.username}
                  </Link>
                ) : (
                  <span>{listing.provider.name ?? "Pro"}</span>
                )}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-widest text-white/40">{listing.provider.role.toLowerCase()}</p>
                {listing.rating !== null && listing.ratingCount > 0 && (
                  <p className="text-xs text-amber-300">
                    ★ {listing.rating.toFixed(1)} <span className="text-white/40">({listing.ratingCount})</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 whitespace-pre-line text-sm leading-relaxed text-white/75">
            {listing.description}
          </div>

          {listing.exampleAudioUrl && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-white/45">Sample</p>
              <CompactAudioPlayer src={listing.exampleAudioUrl} label="Sample" />
            </div>
          )}

          {listing.reviews.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/45">
                Recent reviews
              </p>
              <div className="space-y-3">
                {listing.reviews.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{r.buyer.name ?? "Buyer"}</p>
                      <span className="text-amber-300 text-sm">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    </div>
                    {r.body && <p className="mt-2 text-sm text-white/70">{r.body}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: pricing card + buy CTA */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl border border-white/10 bg-white/3 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-white/45">Price</p>
            <p className="mt-1 text-4xl font-black text-brand-300">
              ${Number(listing.priceUsd).toFixed(2)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-white/40">Delivery</p>
                <p className="font-semibold">
                  {meta.isInstant ? "Instant download" : `${listing.deliveryDays} days`}
                </p>
              </div>
              <div>
                <p className="text-white/40">Sold</p>
                <p className="font-semibold">{listing.totalSold}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-white/45">
              Checkout supports Stripe and PayPal.
            </p>

            <div className="mt-6">
              {listing.status !== "LIVE" ? (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-white/55">
                  This listing is {listing.status.toLowerCase()}.
                </div>
              ) : isOwner ? (
                <Link
                  href="/dashboard/services"
                  className="block w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-semibold text-white/70 hover:bg-white/10"
                >
                  Manage listing →
                </Link>
              ) : !session?.user?.id ? (
                <Link
                  href={`/auth/signin?callbackUrl=/services/${listing.id}`}
                  className="block w-full rounded-xl bg-brand-500 px-4 py-3 text-center text-sm font-bold text-white hover:bg-brand-600"
                >
                  Sign in to book
                </Link>
              ) : (
                <BuyServiceButton listingId={listing.id} isInstant={meta.isInstant} paypalEnabled={paypalEnabled} />
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
