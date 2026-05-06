import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META, canListServices } from "@/lib/serviceListings";
import OrderActions from "./OrderActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Services",
};

export default async function ServicesDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/services");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || !canListServices(user.role)) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Producer or Engineer accounts only</h1>
        <p className="mt-2 text-sm text-white/55">
          This dashboard is for engineers and producers running a storefront.
        </p>
      </div>
    );
  }

  const [listings, openOrders] = await Promise.all([
    prisma.serviceListing.findMany({
      where: { providerId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.serviceOrder.findMany({
      where: { providerId: session.user.id, status: { in: ["PAID", "IN_PROGRESS"] } },
      orderBy: { createdAt: "asc" },
      take: 25,
      include: {
        listing: { select: { title: true, kind: true } },
        buyer: { select: { name: true, email: true } },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
            {user.role === "ENGINEER" ? "Engineer" : "Producer"} dashboard
          </p>
          <h1 className="text-3xl font-extrabold">My services</h1>
          <p className="mt-1 text-sm text-white/55">
            Manage listings and deliver open orders.
          </p>
        </div>
        <Link
          href="/services/new"
          className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600"
        >
          + New listing
        </Link>
      </div>

      {/* Open orders */}
      {openOrders.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-amber-300">
            🔥 {openOrders.length} order{openOrders.length === 1 ? "" : "s"} waiting
          </h2>
          <div className="space-y-3">
            {openOrders.map((o) => (
              <div
                key={o.id}
                className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{o.listing.title}</p>
                    <p className="text-xs text-white/45">
                      {SERVICE_KIND_META[o.listing.kind].label} · ${Number(o.priceUsd).toFixed(2)} · from {o.buyer.name ?? o.buyer.email}
                    </p>
                    {o.briefText && (
                      <p className="mt-2 whitespace-pre-line rounded-lg bg-white/5 px-3 py-2 text-xs text-white/65">
                        {o.briefText}
                      </p>
                    )}
                  </div>
                  <OrderActions orderId={o.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Listings */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
          Listings
        </h2>
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-12 text-center text-sm text-white/40">
            No listings yet.{" "}
            <Link href="/services/new" className="text-brand-300 hover:underline">
              Create your first →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {listings.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0d0d14] p-4 transition hover:border-brand-500/30"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.title}</p>
                  <p className="text-xs text-white/45">
                    {SERVICE_KIND_META[s.kind].label} · ${Number(s.priceUsd).toFixed(2)} · {s.totalSold} sold
                  </p>
                </div>
                <span
                  className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    s.status === "LIVE"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-white/15 bg-white/5 text-white/55"
                  }`}
                >
                  {s.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
