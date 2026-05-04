import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Orders | Epic Music Space" };

const STATUS_BADGE: Record<string, string> = {
  PENDING: "border-white/15 bg-white/5 text-white/55",
  PAID: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  IN_PROGRESS: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  DELIVERED: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  REFUNDED: "border-red-400/40 bg-red-400/10 text-red-300",
  CANCELLED: "border-red-400/40 bg-red-400/10 text-red-300",
};

export default async function OrdersDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/orders");

  const orders = await prisma.serviceOrder.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      listing: { select: { title: true, kind: true, downloadUrl: true } },
      provider: { select: { name: true, username: true, image: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">My orders</p>
        <h1 className="text-3xl font-extrabold">Services I&apos;ve booked</h1>
        <p className="mt-1 text-sm text-white/55">
          Mixes, masters, beats, templates, and lessons.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-12 text-center text-sm text-white/45">
          No orders yet. <Link href="/services" className="text-brand-300 hover:underline">Browse services →</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const meta = SERVICE_KIND_META[o.listing.kind];
            return (
              <Link
                key={o.id}
                href={`/dashboard/orders/${o.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-[#0d0d14] p-4 transition hover:border-brand-500/30 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{o.listing.title}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_BADGE[o.status]}`}
                    >
                      {o.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-xs text-white/45">
                    {meta.label} · ${Number(o.priceUsd).toFixed(2)} · from {o.provider.name ?? o.provider.username ?? "Pro"}
                  </p>
                </div>
                <span className="flex-shrink-0 text-xs font-semibold text-brand-300">
                  Open →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
