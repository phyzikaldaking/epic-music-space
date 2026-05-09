import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { isPayPalConfigured } from "@/lib/paypal";
import { classifyStripeError } from "@/lib/stripeError";

export const metadata: Metadata = {
  title: "Payouts health",
  description: "Platform-side health for Stripe Connect, PayPal, and payout flow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ProbeResult {
  ok: boolean;
  detail: string;
  remediation?: string;
}

/**
 * Probe Stripe by calling the same Connect surface artists hit. Returns
 * a structured pass/fail with remediation copy so we can fix dashboard
 * misconfiguration without redeploying. The probe is cheap — a single
 * accounts.list with limit=1 — and exercises the platform's permission
 * to call the Connect API at all.
 */
async function probeStripe(): Promise<ProbeResult> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      ok: false,
      detail: "STRIPE_SECRET_KEY is not set in this environment.",
      remediation:
        "Set STRIPE_SECRET_KEY in Vercel env vars (production) and redeploy.",
    };
  }
  try {
    await stripe.accounts.list({ limit: 1 });
    return { ok: true, detail: "Connect API reachable." };
  } catch (err) {
    const classified = classifyStripeError(err);
    return {
      ok: false,
      detail:
        classified.log.raw ||
        classified.clientMessage ||
        "Unknown Stripe error.",
      remediation: classified.isPlatformConfigError
        ? "Open the Stripe dashboard → Settings → Connect onboarding and complete the platform profile. The Express capability must be activated for this account."
        : `Stripe code: ${classified.log.code ?? "n/a"} · request id: ${classified.log.requestId ?? "n/a"}. Check the Stripe dashboard logs for that request id.`,
    };
  }
}

async function probePayPal(): Promise<ProbeResult> {
  if (!isPayPalConfigured()) {
    return {
      ok: false,
      detail: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set.",
      remediation:
        "Add PayPal credentials in Vercel env vars and redeploy if you want PayPal payouts as a second rail.",
    };
  }
  return {
    ok: true,
    detail: "PayPal credentials present (token fetch happens on first use).",
  };
}

export default async function AdminPayoutsHealthPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/payouts");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const [stripeProbe, paypalProbe, userStats] = await Promise.all([
    probeStripe(),
    probePayPal(),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { stripeConnectId: { not: null } } }),
      prisma.user.count({ where: { connectChargesEnabled: true, connectPayoutsEnabled: true } }),
      prisma.user.count({ where: { stripeConnectId: { not: null }, connectPayoutsEnabled: false } }),
    ]),
  ]);

  const [totalUsers, withConnect, fullyEnabled, stalled] = userStats;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300">
          Admin · Payouts
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-gradient-ems">Payout rail health</h1>
        <p className="mt-1 text-sm text-white/55">
          Platform-side connectivity probes. If Stripe is red here, no artist will
          be able to onboard until it&apos;s green.
        </p>
      </div>

      <section className="mb-6 rounded-2xl border border-white/10 studio-faceplate p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">
            Stripe Connect
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
              stripeProbe.ok
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {stripeProbe.ok ? "OK" : "FAILING"}
          </span>
        </div>
        <p className="mt-2 break-words text-sm text-white/80">{stripeProbe.detail}</p>
        {stripeProbe.remediation && (
          <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-amber-200">
            <span className="font-bold uppercase tracking-widest text-amber-300">Fix:</span>{" "}
            {stripeProbe.remediation}
          </p>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 studio-faceplate p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">
            PayPal payouts
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
              paypalProbe.ok
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
          >
            {paypalProbe.ok ? "OK" : "OPTIONAL"}
          </span>
        </div>
        <p className="mt-2 break-words text-sm text-white/80">{paypalProbe.detail}</p>
        {paypalProbe.remediation && (
          <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-amber-200">
            <span className="font-bold uppercase tracking-widest text-amber-300">Fix:</span>{" "}
            {paypalProbe.remediation}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 studio-faceplate p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white/60">
          Funnel
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-white/40">Users</dt>
            <dd className="mt-1 text-2xl font-bold text-white">{totalUsers}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-white/40">
              Connect started
            </dt>
            <dd className="mt-1 text-2xl font-bold text-white">{withConnect}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-white/40">
              Payouts enabled
            </dt>
            <dd className="mt-1 text-2xl font-bold text-emerald-300">
              {fullyEnabled}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-widest text-white/40">
              Stuck in KYC
            </dt>
            <dd className="mt-1 text-2xl font-bold text-amber-300">{stalled}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
