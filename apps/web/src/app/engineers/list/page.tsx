import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EngineerListClient from "./EngineerListClient";

export const dynamic = "force-dynamic";

// /engineers/list — onboarding surface for engineers. Server component
// loads the existing profile (if any) so the form pre-fills, then
// hands off to the client component for the editable UI.

export default async function EngineersListPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/engineers/list");
  }
  const [profile, listings, user] = await Promise.all([
    prisma.engineerProfile.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.verseListing.findMany({
      where: {
        sellerId: session.user.id,
        kind: { in: ["ENGINEER_MIX", "ENGINEER_MASTER"] },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionTier: true,
        stripeConnectId: true,
        connectDetailsSubmitted: true,
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <EngineerListClient
        initialProfile={
          profile
            ? {
                id: profile.id,
                tagline: profile.tagline,
                bio: profile.bio,
                specialties: profile.specialties,
                gearChain: profile.gearChain,
                maxSampleRate: profile.maxSampleRate,
                lufsTargets: profile.lufsTargets,
                turnaroundHours: profile.turnaroundHours,
                sampleWorkUrls: profile.sampleWorkUrls,
                isAcceptingWork: profile.isAcceptingWork,
                verifiedAt: profile.verifiedAt
                  ? profile.verifiedAt.toISOString()
                  : null,
              }
            : null
        }
        initialListings={listings.map((l) => ({
          id: l.id,
          kind: l.kind,
          title: l.title,
          priceUsd: Number(l.priceUsd),
          sessionMinutes: l.sessionMinutes,
          deliveryDays: l.deliveryDays,
          status: l.status,
        }))}
        connectReady={
          !!user?.stripeConnectId && user.connectDetailsSubmitted === true
        }
        proTier={["PRO", "PRIME", "TEAM", "LABEL_TIER"].includes(
          user?.subscriptionTier ?? "FREE",
        )}
      />
    </main>
  );
}
