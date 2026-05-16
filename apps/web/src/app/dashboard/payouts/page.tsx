import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import PayoutActions from "./PayoutActions";
import PayoutMethodPicker from "./PayoutMethodPicker";
import IdentityVerifyButton from "@/components/IdentityVerifyButton";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";

export const dynamic = "force-dynamic";

interface ConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  kycStatus: "not_started" | "pending" | "action_required" | "verified";
  currentlyDue: string[];
  errors: Array<{ code: string; reason: string; requirement: string }>;
  disabledReason: string | null;
  actionUrl: string | null;
  country: string | null;
  taxFormStatus: string;
}

async function getConnectStatus(
  stripeConnectId: string | null,
  dbFields: { connectCountry: string | null; taxFormStatus: string }
): Promise<ConnectStatus> {
  if (!stripeConnectId) {
    return {
      connected: false,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      kycStatus: "not_started",
      currentlyDue: [],
      errors: [],
      disabledReason: null,
      actionUrl: null,
      country: null,
      taxFormStatus: dbFields.taxFormStatus,
    };
  }
  try {
    const { stripe } = await import("@/lib/stripe");
    const account = await stripe.accounts.retrieve(stripeConnectId);
    const req = account.requirements;
    const currentlyDue: string[] = req?.currently_due ?? [];
    const disabledReason: string | null = req?.disabled_reason ?? null;
    const errors: Array<{ code: string; reason: string; requirement: string }> =
      (req?.errors ?? []).map((e) => ({
        code: e.code,
        reason: e.reason,
        requirement: e.requirement,
      }));

    let kycStatus: ConnectStatus["kycStatus"];
    if (!account.details_submitted) kycStatus = "not_started";
    else if (currentlyDue.length > 0 || disabledReason) kycStatus = "action_required";
    else if (!account.charges_enabled || !account.payouts_enabled) kycStatus = "pending";
    else kycStatus = "verified";

    return {
      connected: true,
      onboardingComplete: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      kycStatus,
      currentlyDue,
      errors,
      disabledReason,
      actionUrl: null, // fetched separately in the KYC route if needed
      country: account.country ?? dbFields.connectCountry,
      taxFormStatus: dbFields.taxFormStatus,
    };
  } catch {
    return {
      connected: true,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      kycStatus: "not_started",
      currentlyDue: [],
      errors: [],
      disabledReason: null,
      actionUrl: null,
      country: dbFields.connectCountry,
      taxFormStatus: dbFields.taxFormStatus,
    };
  }
}

const US_1099K_THRESHOLD = 600;
const VAT_REGIONS = new Set([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","AU","NZ","NO","CH","SG",
]);

export default async function PayoutsPage(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const justConnected =
    searchParams.connected === "1" ||
    searchParams.connect === "success" ||
    searchParams.kyc === "success";

  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      stripeConnectId: true,
      connectCountry: true,
      taxFormStatus: true,
      identityVerifiedAt: true,
      role: true,
      songs: {
        where: { isActive: true },
        select: {
          id: true,
          title: true,
          licensePrice: true,
          revenueSharePct: true,
          soldLicenses: true,
          payouts: {
            select: { id: true, amount: true, status: true, period: true, paidAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user || user.role === "LISTENER") redirect("/dashboard");

  const connectStatus = await getConnectStatus(user.stripeConnectId, {
    connectCountry: user.connectCountry,
    taxFormStatus: user.taxFormStatus,
  });

  // YTD earnings for 1099 tracking
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytdResult = await prisma.payout.aggregate({
    where: { userId: session.user.id, status: "PAID", paidAt: { gte: yearStart } },
    _sum: { amount: true },
  });
  const ytdEarnings = Number(ytdResult._sum.amount ?? 0);

  const country = connectStatus.country;
  const isUs = country === "US";
  const requiresVat = country !== null && VAT_REGIONS.has(country);
  const exceeds1099 = isUs && ytdEarnings >= US_1099K_THRESHOLD;
  const approaching1099 = isUs && !exceeds1099 && ytdEarnings >= US_1099K_THRESHOLD * 0.8;

  const songsWithEarnings = user.songs.map((song) => {
    const pendingPayouts = song.payouts.filter((p) => p.status === "PENDING");
    const paidPayouts = song.payouts.filter((p) => p.status === "PAID");
    const pendingAmount = pendingPayouts.reduce((s, p) => s + Number(p.amount), 0);
    const paidAmount = paidPayouts.reduce((s, p) => s + Number(p.amount), 0);
    const revenueShare = Number(song.revenueSharePct) / 100;
    const estimatedEarnings = Number(song.licensePrice) * song.soldLicenses * revenueShare;
    return { ...song, pendingAmount, paidAmount, estimatedEarnings, hasPending: pendingPayouts.length > 0 };
  });

  const totalPending = songsWithEarnings.reduce((s, sg) => s + sg.pendingAmount, 0);
  const totalPaid = songsWithEarnings.reduce((s, sg) => s + sg.paidAmount, 0);

  // 30-day forecast: license sales momentum based on recent velocity.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const [sales14d, sales30d] = await Promise.all([
    prisma.licenseToken.aggregate({
      where: {
        purchasedAt: { gte: since14d },
        song: { artistId: session.user.id },
      },
      _count: { _all: true },
      _sum: { price: true },
    }),
    prisma.licenseToken.aggregate({
      where: {
        purchasedAt: { gte: since30d },
        song: { artistId: session.user.id },
      },
      _count: { _all: true },
      _sum: { price: true },
    }),
  ]);
  const sales14dCount = sales14d._count._all;
  const sales30dCount = sales30d._count._all;
  const sales14dGross = Number(sales14d._sum.price ?? 0);
  const sales30dGross = Number(sales30d._sum.price ?? 0);
  const dailyRate = sales14dCount / 14;
  const projected30dCount = Math.round(dailyRate * 30);
  const avgTicket =
    sales14dCount > 0
      ? sales14dGross / sales14dCount
      : sales30dCount > 0
        ? sales30dGross / sales30dCount
        : 0;
  const projected30dGross = projected30dCount * avgTicket;

  function fmt(n: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  }

  const payoutsBlocked =
    !connectStatus.connected ||
    !connectStatus.payoutsEnabled ||
    connectStatus.currentlyDue.length > 0;

  return (
    <div className="studio-room relative min-h-screen">
      <div className="relative z-[1] mx-auto max-w-4xl px-4 py-12">
        <DashboardPageHeader
          eyebrow="Revenue control"
          title="Payouts"
          description="Track your verified payout status, tax readiness, and the money moving out of the platform."
          backHref="/dashboard"
          stats={[
            { label: "Pending", value: fmt(totalPending), tone: "amber" },
            { label: "Paid out", value: fmt(totalPaid), tone: "emerald" },
            { label: "YTD", value: fmt(ytdEarnings), tone: "brand" },
            { label: "Songs", value: songsWithEarnings.length.toString(), tone: "neutral" },
          ]}
          actions={
            <>
              <Link
                href="/dashboard/wallet"
                className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                View wallet
              </Link>
              <Link
                href="/dashboard/services"
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/8"
              >
                Manage services
              </Link>
            </>
          }
          aside={
            <div className="space-y-3">
              <div className={`rounded-2xl border p-4 ${payoutsBlocked ? "border-amber-500/30 bg-amber-500/8" : "border-emerald-500/30 bg-emerald-500/8"}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                  Payout status
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {payoutsBlocked ? "Needs attention" : "Ready to pay"}
                </p>
                <p className="mt-1 text-sm leading-6 text-white/55">
                  {payoutsBlocked
                    ? "Finish Connect, identity, or tax verification so funds can move on the weekly cycle."
                    : "Stripe Connect is clear and weekly payouts can move without manual follow-up."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Link
                    href="/dashboard/wallet"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/8"
                  >
                    Review wallet
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/8"
                  >
                    Back to control room
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                  30-day forecast
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {projected30dCount} projected license sale{projected30dCount === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm leading-6 text-white/55">
                  Baseline gross license revenue:{" "}
                  <span className="font-semibold text-white/80">
                    {fmt(projected30dGross)}
                  </span>
                  .
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                      Last 14 days
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white/80">
                      {sales14dCount} sale{sales14dCount === 1 ? "" : "s"} · {fmt(sales14dGross)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
                      Last 30 days
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white/80">
                      {sales30dCount} sale{sales30dCount === 1 ? "" : "s"} · {fmt(sales30dGross)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-white/40">
                  Directional only. Streaming payouts are periodic; this tracks near-term sales momentum.
                </p>
              </div>
            </div>
          }
        />

      {/* ── Success toast ───────────────────────────────────────────────── */}
      {justConnected && (
        <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 px-5 py-4 text-green-300 font-semibold">
          🎉 Stripe Connect is set up! You&apos;ll receive automatic payouts when licenses sell.
        </div>
      )}

      {/* ── Payout method picker (Stripe vs PayPal) ─────────────────────── */}
      <PayoutMethodPicker />

      {/* ── KYC / Connect status card ───────────────────────────────────── */}
      <KycStatusCard status={connectStatus} />

      {/* ── Tax compliance card ─────────────────────────────────────────── */}
      {connectStatus.connected && (
        <TaxComplianceCard
          country={country}
          isUs={isUs}
          requiresVat={requiresVat}
          ytdEarnings={ytdEarnings}
          approaching1099={approaching1099}
          exceeds1099={exceeds1099}
          taxFormStatus={connectStatus.taxFormStatus}
          fmt={fmt}
        />
      )}

      {/* ── Stripe Identity verification ────────────────────────────────── */}
      {connectStatus.connected && (
        <IdentityVerificationCard verifiedAt={user.identityVerifiedAt} />
      )}

      {/* ── Summary stats ───────────────────────────────────────────────── */}
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

      {/* ── Per-song earnings table ─────────────────────────────────────── */}
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
                    {fmt(Number(song.licensePrice))} each · {Number(song.revenueSharePct)}% your share
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

                  {song.hasPending && !payoutsBlocked && (
                    <PayoutActions action="payout" songId={song.id} label="Request Payout" />
                  )}
                  {song.hasPending && payoutsBlocked && (
                    <span className="text-xs text-white/20 italic">complete verification first</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        Fee transparency line. Was previously text-white/20 (essentially
        invisible) — bumped to white/55 + structured copy so the 10%
        platform-fee disclosure is unambiguous on the surface where the
        artist actually sees their numbers. This visibility is what
        protects the "100% to the artist" claim used in marketing.
      */}
      <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xs text-white/60">
        Every license sale is allocated 100% to the artist. EMS charges a flat
        <strong className="text-white"> 10% platform fee</strong> per license,
        itemized on each payout above. Stripe processes transfers within 2
        business days. Minimum payout: $10.00.
      </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components (co-located for SSR simplicity)
// ─────────────────────────────────────────────────────────────────────────────

function KycStatusCard({ status }: { status: ConnectStatus }) {
  const kycLabels: Record<ConnectStatus["kycStatus"], string> = {
    not_started: "Identity Verification Required",
    pending: "Verification Under Review",
    action_required: "Action Required — Verification Incomplete",
    verified: "Identity Verified",
  };

  const kycColors: Record<ConnectStatus["kycStatus"], string> = {
    not_started: "border-brand-500/40 bg-brand-500/5",
    pending: "border-yellow-500/40 bg-yellow-500/5",
    action_required: "border-red-500/40 bg-red-500/5",
    verified: "border-green-500/30 bg-green-500/5",
  };

  const dotColors: Record<ConnectStatus["kycStatus"], string> = {
    not_started: "bg-brand-400",
    pending: "bg-yellow-400",
    action_required: "bg-red-400",
    verified: "bg-green-400",
  };

  return (
    <div className={`glass-card rounded-2xl border p-6 mb-6 ${kycColors[status.kycStatus]}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${dotColors[status.kycStatus]} animate-pulse`} />
            <span className="text-sm font-semibold text-white/80">{kycLabels[status.kycStatus]}</span>
          </div>

          {status.kycStatus === "not_started" && (
            <p className="text-white/40 text-sm mt-1">
              Connect your Stripe account and verify your identity to receive payouts.
            </p>
          )}
          {status.kycStatus === "pending" && (
            <p className="text-white/40 text-sm mt-1">
              Stripe is reviewing your documents. This typically takes 1–2 business days.
            </p>
          )}
          {status.kycStatus === "action_required" && (
            <div className="mt-2">
              <p className="text-red-300/80 text-sm mb-2">
                Stripe requires additional information before payouts can be enabled.
              </p>
              {status.currentlyDue.length > 0 && (
                <ul className="text-xs text-white/40 list-disc list-inside space-y-0.5">
                  {status.currentlyDue.slice(0, 5).map((req) => (
                    <li key={req}>{humanizeRequirement(req)}</li>
                  ))}
                  {status.currentlyDue.length > 5 && (
                    <li>…and {status.currentlyDue.length - 5} more</li>
                  )}
                </ul>
              )}
              {status.disabledReason && (
                <p className="text-xs text-red-300/60 mt-1">
                  Disabled reason: {status.disabledReason}
                </p>
              )}
            </div>
          )}
          {status.kycStatus === "verified" && (
            <div className="mt-3 flex gap-4 text-xs">
              <span className={status.chargesEnabled ? "text-green-400" : "text-white/30"}>
                {status.chargesEnabled ? "✓" : "○"} Charges enabled
              </span>
              <span className={status.payoutsEnabled ? "text-green-400" : "text-white/30"}>
                {status.payoutsEnabled ? "✓" : "○"} Payouts enabled
              </span>
              {status.country && (
                <span className="text-white/30">Country: {status.country}</span>
              )}
            </div>
          )}
        </div>

        {(status.kycStatus === "not_started" || status.kycStatus === "action_required") && (
          <PayoutActions
            action="onboard"
            label={status.kycStatus === "action_required" ? "Resolve in Stripe" : "Start Verification"}
          />
        )}
      </div>
    </div>
  );
}

function TaxComplianceCard({
  country, isUs, requiresVat, ytdEarnings, approaching1099, exceeds1099, taxFormStatus, fmt,
}: {
  country: string | null;
  isUs: boolean;
  requiresVat: boolean;
  ytdEarnings: number;
  approaching1099: boolean;
  exceeds1099: boolean;
  taxFormStatus: string;
  fmt: (n: number) => string;
}) {
  const taxStatusLabel: Record<string, string> = {
    NOT_COLLECTED: "Tax Info Not Collected",
    PENDING: "Tax Info Pending",
    COLLECTED: "Tax Info Collected",
    EXEMPT: "Tax Exempt",
  };

  const borderColor = exceeds1099
    ? "border-orange-500/40 bg-orange-500/5"
    : approaching1099
    ? "border-yellow-500/30 bg-yellow-500/5"
    : "border-white/10 bg-white/[0.02]";

  // Hard gate: payouts won't run until tax info is COLLECTED or EXEMPT
  // (enforced server-side in lib/payouts.ts). Surface that contract in
  // the UI with a clear CTA so artists aren't stuck wondering why money
  // isn't moving.
  const taxBlocked = taxFormStatus !== "COLLECTED" && taxFormStatus !== "EXEMPT";

  return (
    <div className={`glass-card rounded-2xl border p-6 mb-8 ${taxBlocked ? "border-yellow-500/45 bg-yellow-500/8" : borderColor}`}>
      {taxBlocked && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/8 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-semibold text-yellow-200">Tax info required before your first payout</p>
            <p className="mt-0.5 text-xs text-yellow-100/65">
              Stripe collects your W-9 (US) or W-8BEN (non-US) during onboarding. Until your tax form
              is on file we hold your earnings — they don&apos;t go anywhere, but they won&apos;t pay
              out on the weekly run.
            </p>
          </div>
          <a
            href="/api/stripe-connect/onboarding"
            className="flex-shrink-0 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-[#0a0a0a] hover:bg-yellow-300"
          >
            Complete tax info on Stripe →
          </a>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white/70 mb-1">
            Tax Compliance — {taxStatusLabel[taxFormStatus] ?? taxFormStatus}
          </h3>

          {isUs && (
            <div className="text-xs text-white/50 space-y-1 mt-2">
              <p>
                US resident · YTD paid out:{" "}
                <span className={exceeds1099 ? "text-orange-400 font-semibold" : approaching1099 ? "text-yellow-400 font-semibold" : "text-white/70"}>
                  {fmt(ytdEarnings)}
                </span>{" "}
                / $600 IRS 1099-K threshold
              </p>
              {exceeds1099 && (
                <p className="text-orange-300">
                  ⚠ You have exceeded the $600 threshold. Stripe will file a 1099-K on your behalf
                  at year-end. Ensure your SSN or EIN is current in your Stripe Express account.
                </p>
              )}
              {approaching1099 && (
                <p className="text-yellow-300">
                  You are approaching the $600 IRS 1099-K reporting threshold.
                </p>
              )}
              {!approaching1099 && !exceeds1099 && (
                <p>
                  Stripe automatically files a 1099-K once you earn $600+ in a calendar year.
                  No action needed until then.
                </p>
              )}
            </div>
          )}

          {requiresVat && !isUs && (
            <div className="text-xs text-white/50 space-y-1 mt-2">
              <p>
                Account registered in <span className="text-white/70">{country}</span> · VAT / GST region.
              </p>
              <p>
                Stripe Express collects your tax ID during onboarding. Consult your local tax advisor
                for VAT obligations on digital services.
              </p>
            </div>
          )}

          {!isUs && !requiresVat && country && (
            <p className="text-xs text-white/40 mt-2">
              Account in {country}. No EMS-level tax collection required. Local obligations may apply.
            </p>
          )}

          {!country && (
            <p className="text-xs text-white/40 mt-2">
              Complete Stripe Connect onboarding to determine your tax region.
            </p>
          )}
        </div>

        <div className="text-xs text-white/30 text-right shrink-0">
          <div className="text-white/50 font-semibold">{fmt(ytdEarnings)}</div>
          <div>YTD {new Date().getFullYear()}</div>
        </div>
      </div>
    </div>
  );
}

/** Converts Stripe requirement field names into readable strings */
function humanizeRequirement(field: string): string {
  const map: Record<string, string> = {
    "individual.id_number": "Social Security Number (SSN) or Tax ID",
    "individual.verification.document": "Government-issued photo ID",
    "individual.dob.day": "Date of birth",
    "individual.address.line1": "Home address",
    "individual.ssn_last_4": "Last 4 digits of SSN",
    "business_profile.url": "Business website URL",
    "tos_acceptance.date": "Terms of Service acceptance",
    "external_account": "Bank account for payouts",
  };
  return map[field] ?? field.replace(/_/g, " ").replace(/\./g, " › ");
}


function IdentityVerificationCard({ verifiedAt }: { verifiedAt: Date | null }) {
  const verified = !!verifiedAt;
  return (
    <div
      className={`glass-card mb-8 rounded-2xl border p-6 ${
        verified
          ? "border-emerald-500/35 bg-emerald-500/6"
          : "border-cyan-500/35 bg-cyan-500/6"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h3 className={`text-sm font-semibold ${verified ? "text-emerald-300" : "text-cyan-300"}`}>
            Identity verification — {verified ? "Verified" : "Optional today, required for high-value payouts"}
          </h3>
          <p className="mt-1 text-xs text-white/55">
            {verified
              ? `Government-ID + selfie verified on ${verifiedAt!.toLocaleDateString()}. High-value payouts and label deals are unlocked.`
              : "Adds a Stripe-verified ID + selfie check on top of Stripe Express's tax / bank flow. Required for label payouts and any single transfer over the platform threshold."}
          </p>
        </div>
        {!verified && (
          <div className="flex-shrink-0">
            <IdentityVerifyButton />
          </div>
        )}
      </div>
    </div>
  );
}
