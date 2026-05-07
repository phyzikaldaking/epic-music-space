import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERVICE_KIND_META } from "@/lib/serviceListings";
import OrderWorkspace from "./OrderWorkspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Order" };

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");
  const { orderId } = await params;
  const { token, status } = await searchParams;

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    include: {
      listing: true,
      buyer: { select: { id: true, name: true, image: true, username: true } },
      provider: { select: { id: true, name: true, image: true, username: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { fromUser: { select: { id: true, name: true, image: true } } },
      },
      revisions: { orderBy: { revisionNumber: "asc" } },
      review: true,
    },
  });

  if (!order) notFound();
  if (order.buyerId !== session.user.id && order.providerId !== session.user.id) {
    notFound();
  }

  const isProvider = order.providerId === session.user.id;
  const meta = SERVICE_KIND_META[order.listing.kind];

  return (
    <OrderWorkspace
      order={{
        id: order.id,
        status: order.status,
        priceUsd: order.priceUsd.toString(),
        briefText: order.briefText,
        briefUrl: order.briefUrl,
        deliverableUrl: order.deliverableUrl,
        deliveredAt: order.deliveredAt?.toISOString() ?? null,
        completedAt: order.completedAt?.toISOString() ?? null,
        acceptDeadline: order.acceptDeadline?.toISOString() ?? null,
        revisionsUsed: order.revisionsUsed,
        listing: {
          id: order.listing.id,
          title: order.listing.title,
          kindLabel: meta.label,
          isInstant: meta.isInstant,
          deliveryDays: order.listing.deliveryDays,
        },
        buyer: order.buyer,
        provider: order.provider,
        messages: order.messages.map((m) => ({
          id: m.id,
          fromUserId: m.fromUserId,
          name: m.fromUser.name,
          image: m.fromUser.image,
          body: m.body,
          attachmentUrl: m.attachmentUrl,
          createdAt: m.createdAt.toISOString(),
        })),
        revisions: order.revisions.map((r) => ({
          id: r.id,
          revisionNumber: r.revisionNumber,
          deliverableUrl: r.deliverableUrl,
          message: r.message,
          deliveredAt: r.deliveredAt.toISOString(),
        })),
        review: order.review
          ? { rating: order.review.rating, body: order.review.body }
          : null,
      }}
      currentUserId={session.user.id}
      isProvider={isProvider}
      paypalReturnToken={status === "paypal-return" ? token ?? null : null}
    />
  );
}
