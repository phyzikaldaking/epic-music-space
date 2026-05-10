import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import ServiceOrderStageBar from "@/components/dashboard/ServiceOrderStageBar";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Orders" };

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
  const pendingOrders = orders.filter((order) => order.status === "PENDING" || order.status === "PAID" || order.status === "IN_PROGRESS").length;
  const completedOrders = orders.filter((order) => order.status === "COMPLETED" || order.status === "DELIVERED").length;
  const refundedOrders = orders.filter((order) => order.status === "REFUNDED" || order.status === "CANCELLED").length;
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.priceUsd), 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <DashboardPageHeader
        eyebrow="Buyer workspace"
        title="Services I have booked"
        description="Keep track of every order, follow progress, and open the workspaces where the actual delivery happens."
        backHref="/dashboard"
        stats={[
          { label: "Orders", value: orders.length.toString(), tone: "brand" },
          { label: "Pending", value: pendingOrders.toString(), tone: "amber" },
          { label: "Completed", value: completedOrders.toString(), tone: "emerald" },
          { label: "Spent", value: `$${totalSpent.toFixed(2)}`, tone: "neutral" },
        ]}
        actions={
          <>
            <Link
              href="/marketplace"
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              Browse marketplace
            </Link>
            <Link
              href="/services"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/8"
            >
              Open services
            </Link>
          </>
        }
        aside={
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-300">
              Order flow
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {pendingOrders > 0 ? "Work is in motion" : "Everything is settled"}
            </p>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Open an order to chat with the provider, approve a delivery, or request a revision without losing the thread.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/65">
              {refundedOrders > 0
                ? `${refundedOrders} order${refundedOrders === 1 ? "" : "s"} were refunded or cancelled.`
                : "No refunds or cancellations on the current view."}
            </div>
          </div>
        }
      />

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-white/3 px-5 py-12 text-center text-sm text-white/45">
          <p className="mb-2 text-lg font-semibold text-white/80">No orders yet</p>
          <p className="mx-auto max-w-md">
            When you book a service, this page becomes the command center for delivery, chat, revisions, and review.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link href="/services" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/75 hover:bg-white/8">
              Browse services
            </Link>
            <Link href="/marketplace" className="rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-600">
              Browse marketplace
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const meta = SERVICE_KIND_META[o.listing.kind];
            return (
              <Link
                key={o.id}
                href={`/dashboard/orders/${o.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-white/8 studio-faceplate-dark p-4 transition hover:border-brand-500/30 sm:flex-row sm:items-start sm:justify-between"
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
                  <ServiceOrderStageBar status={o.status} />
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
