"use client";

import dynamic from "next/dynamic";

// Thin client-side shim so the Server-Component root layout can mount
// FeedbackBotWidget without itself becoming a client component. Next.js
// 16 refuses `dynamic(..., { ssr: false })` inside Server Components,
// so we hop into a Client boundary here and lazy-load from there.
const FeedbackBotWidget = dynamic(
  () => import("@/components/FeedbackBotWidget"),
  { ssr: false },
);

export default function FeedbackBotMount() {
  return <FeedbackBotWidget />;
}
