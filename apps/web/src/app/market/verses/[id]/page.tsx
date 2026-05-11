import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import VerseBookFlow from "./VerseBookFlow";

export const revalidate = 30;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = await prisma.verseListing.findUnique({
    where: { id },
    select: { title: true, seller: { select: { name: true, username: true } } },
  });
  if (!listing) return { title: "Verse listing" };
  const artist = listing.seller.name ?? listing.seller.username ?? "artist";
  return { title: `${listing.title} — ${artist}` };
}

export default async function VerseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [listing, session] = await Promise.all([
    prisma.verseListing.findUnique({
      where: { id },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
            subscriptionTier: true,
          },
        },
      },
    }),
    auth(),
  ]);
  if (!listing || listing.status !== "ACTIVE") notFound();

  const youAreSeller = session?.user?.id === listing.sellerId;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href={`/market/artist/${listing.sellerId}`}
        className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-white/55 hover:text-white/85"
      >
        {listing.seller.image ? (
          <Image
            src={listing.seller.image}
            alt={listing.seller.name ?? ""}
            width={24}
            height={24}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : null}
        ← {listing.seller.name ?? listing.seller.username ?? "artist"}
      </Link>

      <header className="mt-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-200">
            {listing.kind === "LIVE_SESSION" ? "Live session" : "Async delivery"}
          </span>
          {listing.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/55"
            >
              {t}
            </span>
          ))}
        </div>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">
          {listing.title}
        </h1>
      </header>

      <section className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-5">
        {listing.description && (
          <p className="whitespace-pre-wrap text-sm text-white/80">
            {listing.description}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/55">
              Price
            </div>
            <div className="mt-0.5 font-display text-2xl text-amber-300">
              ${Number(listing.priceUsd).toFixed(0)}
            </div>
          </div>
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[10px] uppercase tracking-widest text-white/55">
              {listing.kind === "LIVE_SESSION" ? "Session" : "Delivery"}
            </div>
            <div className="mt-0.5 font-display text-xl">
              {listing.kind === "LIVE_SESSION"
                ? `${listing.sessionMinutes} min`
                : `≤ ${listing.deliveryDays} days`}
            </div>
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-widest text-white/40">
          90% to artist · 10% platform fee · funds released on signoff
        </p>
      </section>

      <section className="mt-4">
        {!session?.user ? (
          <Link
            href={`/sign-in?next=/market/verses/${listing.id}`}
            className="block w-full rounded-2xl bg-amber-400 px-4 py-3 text-center text-sm font-black uppercase tracking-widest text-black hover:bg-amber-300"
          >
            Sign in to book
          </Link>
        ) : youAreSeller ? (
          <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 text-center text-sm text-white/55">
            This is your listing.
            <div className="mt-2">
              <Link
                href={`/market/list?edit=${listing.id}`}
                className="text-amber-300 hover:underline"
              >
                Edit
              </Link>
            </div>
          </div>
        ) : (
          <VerseBookFlow
            listingId={listing.id}
            kind={listing.kind}
            sessionMinutes={listing.sessionMinutes}
            sellerId={listing.sellerId}
            priceUsd={Number(listing.priceUsd)}
          />
        )}
      </section>
    </div>
  );
}
