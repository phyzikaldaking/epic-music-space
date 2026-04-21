import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PayoutActions from "./PayoutActions";

export const dynamic = "force-dynamic";

async function getConnectStatus(stripeConnectId: string | null) {
  if (!stripeConnectId) return { connected: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false };
  try {
    const { stripe } = await import("@/lib/stripe");
    const account = await stripe.accounts.retrieve(stripeConnectId);
    return {
      connected: true,
      onboardingComplete: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    };
  } catch {
    return { connected: true, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false };
  }
}

export default async function PayoutsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      stripeConnectId: true,
      role: true,
      songs: {
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          licensePrice: true,
          soldLicenses: true,
          payouts: {
            select: {
              id: true,
              amount: true,
              status: true,
              period: true,
              paidAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user || user.role === "LISTENER") redirect("/dashboard");

  const connectStatus = await getConnectStatus(user.stripeConnectId);

  const songsWithEarnings = user.songs.map((song) => {
    const pendingPayouts = song.payouts.filter((p) => p.status === "PENDING");
    const paidPayouts = song.payouts.filter((p) => p.status === "PAID");
    const pendingAmount = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);
    const paidAmount = paidPayouts.reduce((s, p) => s + Number(p.amount), 0);
    const estimatedEarnings = Number(song.licensePrice) * song.soldLicenses * 0.9;
    return { ...song, pendingAmount, paidAmount, estimatedEarnings, hasPending: pendingPayouts.length > 0 };
  });

  const totalPending = songsWithEarnings.reduce((s, sg) => s + sg.pendingAmount, 0);
  const totalPaid = songsWithEarnings.reduce((s, sg) => s + sg.paidAmount, 0);

  function fmt(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-10">
        <a href="/dashboard" className="text-sm text-white/40 hover:text-white/70 transition mb-4 inline-block">
          ← Dashboard
        </a>
        <h1 className="text-4xl font-extrabold text-gradient-ems">Payouts</h1>
        <p className="mt-2 text-white/50">90% of every license sale, paid directly to you.</p>
      </div>

      {/* Connect status card */}
      <div className={`glass-card rounded-2xl border p-6 mb-8 ${
        connectStatus.onboardingComplete
          ? "border-green-500/30 bg-green-500/5"
          : "border-brand-500/40 bg-brand-500/5"
      }`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${connectStatus.onboardingComplete ? "bg-green-400" : "bg-brand-400"} animate-pulse`} />
              <span className="text-sm font-semibold text-white/70">
                {connectStatus.onboardingComplete
                  ? "Stripe Connect Active"
                  : connectStatus.connected
                  ? "Setup Incomplete"
                  : "Payouts Not Connected"}
              </span>
            </div>
            <p className="text-white/40 text-sm max-w-md">
              {connectStatus.onboardingComplete
                ? "Your Stripe Express account is ready. Payouts transfer directly to your bank."
                : connectStatus.connected
                ? "Finish setting up your Stripe Express account to receive payouts."
                : "Connect Stripe to receive your earnings. Takes about 2 minutes."}
            </p>
            {connectStatus.onboardingComplete && (
              <div className="mt-3 flex gap-4 text-xs">
                <span className={connectStatus.chargesEnabled ? "text-green-400" : "text-white/30"}>
                  {connectStatus.chargesEnabled ? "✓" : "○"} Charges enabled
                </span>
                <span className={connectStatus.payoutsEnabled ? "text-green-400" : "text-white/30"}>
                  {connectStatus.payoutsEnabled ? "✓" : "○"} Payouts enabled
                </span>
              </div>
            )}
          </div>
          {!connectStatus.onboardingComplete && (
            <PayoutActions action="onboard" label={connectStatus.connected ? "Resume Setup" : "Connect Stripe"} />
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {[
          { label: "Pending Payouts", value: fmt(totalPending), color: "text-brand-400" },
          { label: "Total Paid Out", value: fmt(totalPaid), color: "text-green-400" },
          { label: "Songs with Sales", value: songsWithEarnings.filter((s) => s.soldLicenses > 0).length.toString(), color: "text-accent-400" },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-xl border border-white/10 p-5 text-center">
            <div className={`text-2xl font-extrabold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-white/40 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Per-song earnings table */}
      <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h2 className="font-bold text-white/80">Song Earnings</h2>
        </div>

        {songsWithEarnings.length === 0 ? (
          <div className="px-6 py-12 text-center text-white/30">
            No active songs yet. Upload a track to start earning.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {songsWithEarnings.map((song) => (
              <div key={song.id} className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{song.title}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {song.soldLicenses} license{song.soldLicenses !== 1 ? "s" : ""} ·{" "}
                    {fmt(Number(song.licensePrice))} each · 90% share
                  </p>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <div className="text-sm font-bold text-brand-400">{fmt(song.pendingAmount)}</div>
                    <div className="text-xs text-white/30">pending</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-green-400">{fmt(song.paidAmount)}</div>
                    <div className="text-xs text-white/30">paid out</div>
                  </div>

                  {song.hasPending && connectStatus.onboardingComplete && (
                    <PayoutActions action="payout" songId={song.id} label="Request Payout" />
                  )}
                  {song.hasPending && !connectStatus.onboardingComplete && (
                    <span className="text-xs text-white/20 italic">connect Stripe first</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-white/20 text-center">
        EMS retains a 10% platform fee. Stripe processes transfers within 2 business days.
      </p>
    </div>
  );
}
