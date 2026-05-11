import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import BookingSignoffActions from "./BookingSignoffActions";

export const metadata: Metadata = { title: "Session booking" };
export const dynamic = "force-dynamic";

// Booking detail / handoff page. Both buyer and seller land here.
// Shows brief, calendar time, status. Once CONFIRMED + the start
// time hits, surfaces a "Join the session" CTA that links into the
// existing /studio/live/edit/[roomId] view.
export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/sign-in?next=/market/bookings/${id}`);

  const booking = await prisma.sessionBooking.findUnique({
    where: { id },
    include: {
      listing: { select: { title: true, kind: true, sessionMinutes: true, deliveryDays: true } },
      buyer: { select: { id: true, name: true, username: true, image: true } },
      seller: { select: { id: true, name: true, username: true, image: true } },
    },
  });
  if (!booking) notFound();
  if (
    booking.buyerId !== session.user.id &&
    booking.sellerId !== session.user.id
  ) {
    notFound();
  }
  const youAre = booking.buyerId === session.user.id ? "buyer" : "seller";
  const counterparty = youAre === "buyer" ? booking.seller : booking.buyer;
  const youSignedOff =
    (youAre === "buyer" && booking.buyerSignedOffAt) ||
    (youAre === "seller" && booking.sellerSignedOffAt);

  const startInMinutes = booking.startAt
    ? (booking.startAt.getTime() - Date.now()) / 60_000
    : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link
        href="/market"
        className="text-[10px] uppercase tracking-widest text-white/45 hover:underline"
      >
        ← Market
      </Link>

      <header className="mt-3">
        <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-200">
          Booking · {booking.status}
        </span>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">
          {booking.listing.title}
        </h1>
      </header>

      <section className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
        {counterparty.image ? (
          <Image
            src={counterparty.image}
            alt={counterparty.name ?? ""}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-base font-black">
            {(counterparty.name ?? counterparty.username ?? "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-white/55">
            {youAre === "buyer" ? "Artist" : "Buyer"}
          </div>
          <div className="text-sm font-bold">
            {counterparty.name ?? counterparty.username ?? "user"}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl text-amber-300">
            ${Number(booking.agreedPriceUsd).toFixed(0)}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            {booking.listing.kind === "LIVE_SESSION"
              ? `${booking.listing.sessionMinutes} min live`
              : `≤ ${booking.listing.deliveryDays}d delivery`}
          </div>
        </div>
      </section>

      {booking.brief && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
            Brief
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-white/85">
            {booking.brief}
          </p>
        </section>
      )}

      {booking.startAt && (
        <section className="mt-4 rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.05] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">
            Scheduled
          </div>
          <div className="mt-1 font-mono text-base">
            {booking.startAt.toLocaleString()}
          </div>
          {booking.status === "CONFIRMED" &&
            startInMinutes !== null &&
            startInMinutes < 30 &&
            startInMinutes > -60 && (
              <Link
                href={
                  booking.roomId
                    ? `/studio/live/edit/${booking.roomId}`
                    : `/studio/live`
                }
                className="mt-3 block rounded-xl bg-cyan-400 px-4 py-2 text-center text-sm font-black uppercase tracking-widest text-black hover:bg-cyan-300"
              >
                Join the live room →
              </Link>
            )}
        </section>
      )}

      {(booking.status === "CONFIRMED" || booking.status === "IN_PROGRESS") && (
        <BookingSignoffActions
          bookingId={booking.id}
          youSignedOff={Boolean(youSignedOff)}
          otherSignedOff={
            youAre === "buyer"
              ? Boolean(booking.sellerSignedOffAt)
              : Boolean(booking.buyerSignedOffAt)
          }
        />
      )}

      {booking.status === "COMPLETED" && (
        <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-200">
          ✓ Booking complete. Funds released.
        </p>
      )}
    </div>
  );
}
