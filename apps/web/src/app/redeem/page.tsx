import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import RedeemForm from "./RedeemForm";

export const metadata: Metadata = {
  title: "Redeem a Code",
  description:
    "Have a code? Redeem it for extra song slots, free Boost credits, or a Pro trial extension on Epic Music Space.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function RedeemPage(
  { searchParams }: { searchParams: Promise<{ code?: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    const { code } = await searchParams;
    const next = code
      ? `/redeem?code=${encodeURIComponent(code)}`
      : "/redeem";
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(next)}`);
  }

  const [user, recent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        bonusSongSlots: true,
        freeBoostCredits: true,
        freeLicenseFeeWaivers: true,
        trialExpiresAt: true,
        subscriptionTier: true,
      },
    }),
    prisma.redeemRedemption.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const { code: prefillCode } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300">
          Bonus rewards
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-gradient-ems sm:text-4xl">
          Redeem a Code
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
          Got a code from us, a creator, or one of our launch drops? Pop it in
          and we&apos;ll add the perks to your account.
        </p>
      </div>

      <RedeemForm initialCode={prefillCode ?? ""} />

      {user && (
        <div className="mt-8 rounded-2xl border border-white/10 studio-faceplate p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/45">
            Your perks
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-white/40">
                Bonus song slots
              </dt>
              <dd className="mt-1 text-2xl font-bold text-white">
                +{user.bonusSongSlots ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-white/40">
                Boost credits
              </dt>
              <dd className="mt-1 text-2xl font-bold text-white">
                {user.freeBoostCredits ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-white/40">
                Fee waivers
              </dt>
              <dd className="mt-1 text-2xl font-bold text-white">
                {user.freeLicenseFeeWaivers ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-widest text-white/40">
                Plan
              </dt>
              <dd className="mt-1 text-sm font-bold text-white">
                {user.subscriptionTier}
                {user.trialExpiresAt && user.trialExpiresAt > new Date() && (
                  <span className="block text-[10px] font-normal text-emerald-300">
                    until {user.trialExpiresAt.toLocaleDateString()}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 studio-faceplate p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-white/45">
            Recently redeemed
          </p>
          <ul className="space-y-1 text-xs text-white/60">
            {recent.map((r) => {
              const reward = r.reward as {
                bonusSongSlots?: number;
                trialDays?: number;
                freeBoostCredits?: number;
                freeLicenseFeeWaivers?: number;
                note?: string;
              };
              const parts: string[] = [];
              if (reward.bonusSongSlots) parts.push(`+${reward.bonusSongSlots} song slots`);
              if (reward.trialDays) parts.push(`+${reward.trialDays}-day Pro trial`);
              if (reward.freeBoostCredits) parts.push(`+${reward.freeBoostCredits} Boost`);
              if (reward.freeLicenseFeeWaivers) parts.push(`+${reward.freeLicenseFeeWaivers} fee waiver`);
              return (
                <li key={r.id} className="flex justify-between gap-4">
                  <span className="truncate">
                    {reward.note ? `${reward.note} · ` : ""}
                    {parts.join(" · ") || "Reward"}
                  </span>
                  <span className="shrink-0 text-white/35">
                    {r.createdAt.toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
