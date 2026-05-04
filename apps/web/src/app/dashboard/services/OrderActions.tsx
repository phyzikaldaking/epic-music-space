"use client";

import Link from "next/link";

export default function OrderActions({ orderId }: { orderId: string }) {
  return (
    <Link
      href={`/dashboard/orders/${orderId}`}
      className="flex-shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-600"
    >
      Open →
    </Link>
  );
}
