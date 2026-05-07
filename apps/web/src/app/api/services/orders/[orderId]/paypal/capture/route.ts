import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimitInline";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { capturePayPalOrder } from "@/lib/paypal";
import { recordServiceSale } from "@/lib/revenueShare";
import { enqueueNotification } from "@/lib/queues";

export const runtime = "nodejs";

const bodySchema = z.object({
  paypalOrderId: z.string().min(8).max(128).optional(),
});

type TransactionMetadata = {
  orderId?: string;
  listingId?: string;
  providerId?: string;
  paymentProvider?: string;
  paypalOrderId?: string;
  paypalCaptureId?: string | null;
  paypalCaptureStatus?: string | null;
  paypalOrderStatus?: string | null;
  [key: string]: unknown;
};

function toMetadata(value: unknown): TransactionMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as TransactionMetadata;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> },
) {
  const { params } = context;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const blocked = await rateLimit("strict", `service:paypal-capture:${session.user.id}:${orderId}`);
  if (blocked) return blocked;
  const ipBlocked = await rateLimit("strict", `service:paypal-capture:ip:${ip}`);
  if (ipBlocked) return ipBlocked;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid PayPal capture request." }, { status: 400 });
  }

  const order = await prisma.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      buyerId: true,
      providerId: true,
      listingId: true,
      priceUsd: true,
      status: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (order.status === "PAID" || order.status === "IN_PROGRESS" || order.status === "DELIVERED" || order.status === "REVISION_REQUESTED" || order.status === "COMPLETED") {
    return NextResponse.json({ ok: true, orderId: order.id, status: order.status, alreadyCaptured: true });
  }
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return NextResponse.json(
      { error: `Order is ${order.status.toLowerCase()} and can no longer be captured.` },
      { status: 409 },
    );
  }

  const serviceTxRows = await prisma.transaction.findMany({
    where: {
      userId: session.user.id,
      type: "SERVICE_PURCHASE",
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      status: true,
      amount: true,
      metadata: true,
    },
  });
  const txRow = serviceTxRows.find((row) => {
    const metadata = toMetadata(row.metadata);
    return metadata.orderId === order.id;
  });
  if (!txRow) {
    return NextResponse.json({ error: "Purchase transaction not found for this order." }, { status: 404 });
  }

  const txMetadata = toMetadata(txRow.metadata);
  const paypalOrderId = parsed.data.paypalOrderId ?? txMetadata.paypalOrderId;
  if (!paypalOrderId) {
    return NextResponse.json({ error: "Missing PayPal order id for this checkout." }, { status: 400 });
  }

  const idempotencyKey = buildIdempotencyKey(req, "service-paypal-capture", [
    order.id,
    session.user.id,
    paypalOrderId,
  ]);

  const capture = await capturePayPalOrder(paypalOrderId, idempotencyKey).catch((err) => {
    return err instanceof Error ? err : new Error("PayPal capture failed.");
  });
  if (capture instanceof Error) {
    return NextResponse.json({ error: capture.message }, { status: 502 });
  }
  if (capture.status !== "COMPLETED") {
    return NextResponse.json(
      { error: `PayPal order is ${capture.status}. Capture not completed.` },
      { status: 409 },
    );
  }

  const settled = await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.serviceOrder.findUnique({
      where: { id: order.id },
      select: { id: true, status: true, providerId: true, listingId: true },
    });
    if (!freshOrder) return null;
    if (freshOrder.status !== "PENDING") {
      return { alreadyCaptured: true, providerId: freshOrder.providerId };
    }

    await tx.serviceOrder.update({
      where: { id: freshOrder.id },
      data: {
        status: "PAID",
      },
    });
    await tx.serviceListing.update({
      where: { id: freshOrder.listingId },
      data: { totalSold: { increment: 1 } },
    });
    await tx.transaction.update({
      where: { id: txRow.id },
      data: {
        status: "SUCCEEDED",
        metadata: {
          ...txMetadata,
          paymentProvider: "paypal",
          paypalOrderId,
          paypalCaptureId: capture.captureId,
          paypalCaptureStatus: capture.captureStatus,
          paypalOrderStatus: capture.status,
        },
      },
    });
    return { alreadyCaptured: false, providerId: freshOrder.providerId };
  });
  if (!settled) {
    return NextResponse.json({ error: "Order not found during settlement." }, { status: 404 });
  }
  if (settled.alreadyCaptured) {
    return NextResponse.json({ ok: true, orderId: order.id, status: "PAID", alreadyCaptured: true });
  }

  try {
    await recordServiceSale({
      providerId: order.providerId,
      transactionId: txRow.id,
      grossDollars: Number(txRow.amount),
    });
  } catch {
    // Non-fatal: order is paid and available to fulfil.
  }

  try {
    await enqueueNotification({
      userId: settled.providerId,
      type: "SERVICE_ORDER",
      title: "New service order 🎚️",
      body: `You have a new PayPal order — $${Number(order.priceUsd).toFixed(2)}.`,
      metadata: { orderId: order.id, paymentProvider: "paypal" },
    });
  } catch {
    // Non-fatal.
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    status: "PAID",
    paymentProvider: "paypal",
    captureId: capture.captureId,
  });
}
