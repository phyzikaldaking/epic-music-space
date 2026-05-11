import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ListVerseForm from "./ListVerseForm";

export const metadata: Metadata = { title: "List your verse" };

export default async function ListVersePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in?next=/market/list");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      subscriptionTier: true,
      stripeConnectId: true,
      connectDetailsSubmitted: true,
      songs: {
        where: { isActive: true },
        select: { id: true, title: true },
        take: 25,
      },
    },
  });
  if (!user) redirect("/sign-in");

  const isProPlus = ["PRO", "PRIME", "TEAM", "LABEL_TIER"].includes(user.subscriptionTier);
  const connectReady = Boolean(user.stripeConnectId && user.connectDetailsSubmitted);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
        List your verse
      </p>
      <h1 className="mt-1 font-display text-3xl uppercase tracking-wide">
        Open the booking window
      </h1>
      <p className="mt-2 text-sm text-white/65">
        Pick a SKU: live joint studio session (calendar-bookable, you
        both join the same room at session time) or async delivery
        (you record on your own time, deliver a WAV).
      </p>

      {!isProPlus && (
        <div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm">
          <strong>PRO tier required.</strong> The rap stock market only
          opens to verified PRO+ artists so buyers know they&apos;re working
          with serious sellers.
          <a
            href="/pricing"
            className="ml-1 font-bold underline hover:text-amber-200"
          >
            Upgrade →
          </a>
        </div>
      )}
      {isProPlus && !connectReady && (
        <div className="mt-6 rounded-2xl border border-cyan-400/40 bg-cyan-500/10 p-4 text-sm">
          <strong>Finish Stripe Connect onboarding</strong> so we have a
          payout route before any money flows.
          <a
            href="/account/payouts"
            className="ml-1 font-bold underline hover:text-cyan-200"
          >
            Set up payouts →
          </a>
        </div>
      )}

      {isProPlus && connectReady && (
        <div className="mt-6">
          <ListVerseForm previewSongs={user.songs} />
        </div>
      )}
    </div>
  );
}
