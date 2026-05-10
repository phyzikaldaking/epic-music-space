import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import CowriterQueueClient from "./queue/CowriterQueueClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Co-writer Offers" };

export default async function CowritersDashboard() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/dashboard/cowriters");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || user.role === "LISTENER") redirect("/dashboard");

  const interests = await prisma.coWriterInterest.findMany({
    where: { song: { artistId: session.user.id } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      status: true,
      shareBpsRequested: true,
      priceCents: true,
      message: true,
      createdAt: true,
      song: { select: { id: true, title: true } },
      fan: { select: { id: true, name: true, username: true, image: true, email: true } },
    },
  });

  const pending = interests.filter((i) => i.status === "PENDING").length;
  const accepted = interests.filter((i) => i.status === "ACCEPTED").length;
  const declined = interests.filter((i) => i.status === "DECLINED").length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <DashboardPageHeader
        eyebrow="Collaboration"
        title="Co-writer offers"
        description="Review incoming co-writer requests, accept the ones that make sense, and keep the queue moving."
        backHref="/dashboard"
        stats={[
          { label: "Pending", value: pending.toString(), tone: "amber" },
          { label: "Accepted", value: accepted.toString(), tone: "emerald" },
          { label: "Declined", value: declined.toString(), tone: "neutral" },
          { label: "Total", value: interests.length.toString(), tone: "brand" },
        ]}
        actions={
          <>
            <Link
              href="/studio/manage"
              className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
            >
              Manage releases
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/8"
            >
              Back to control room
            </Link>
          </>
        }
        aside={
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-300">
              Queue rules
            </p>
            <p className="mt-2 text-lg font-semibold text-white">Fast responses win</p>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Buyers who reach out to collaborate are highest-intent fans. Accept or decline quickly so they stay engaged.
            </p>
          </div>
        }
      />

      <CowriterQueueClient
        initialInterests={interests.map((i) => ({
          id: i.id,
          status: i.status,
          shareBpsRequested: i.shareBpsRequested,
          priceCents: i.priceCents,
          message: i.message,
          createdAt: i.createdAt.toISOString(),
          song: i.song,
          fan: i.fan,
        }))}
      />
    </div>
  );
}

