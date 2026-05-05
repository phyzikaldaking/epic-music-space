import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 4v6c0 5-3 8-7 8s-7-3-7-8V7l7-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8 6 8-6" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 7.5c0-1.93-2.24-3.5-5-3.5s-5 1.57-5 3.5S9.24 11 12 11s5 1.57 5 3.5-2.24 3.5-5 3.5-5-1.57-5-3.5" />
    </svg>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Trust Center | Epic Music Space",
  description: "Your account security, payout status, and platform protections — all in one place.",
};

export default async function TrustCenterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/trust");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      emailVerified: true,
      emailBounced: true,
      isSuspended: true,
      suspicionScore: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
      connectRequirements: true,
      identityVerifiedAt: true,
      taxFormStatus: true,
      createdAt: true,
    },
  });

  if (!user) redirect("/auth/signin");

  const accountAgeDays = Math.floor(
    (Date.now() - user.createdAt.getTime()) / 86_400_000,
  );

  // Security score (0–100)
  let secScore = 100;
  if (!user.emailVerified) secScore -= 30;
  if (user.emailBounced) secScore -= 20;
  if (user.suspicionScore > 0) secScore -= Math.min(user.suspicionScore, 30);
  if (!user.identityVerifiedAt) secScore -= 10;
  secScore = Math.max(0, secScore);

  const secLabel =
    secScore >= 80 ? "Strong" : secScore >= 50 ? "Fair" : "Needs Attention";
  const secColor =
    secScore >= 80
      ? "text-green-400"
      : secScore >= 50
        ? "text-yellow-400"
        : "text-red-400";

  const payoutReady =
    user.connectChargesEnabled &&
    user.connectPayoutsEnabled &&
    user.taxFormStatus === "COLLECTED";

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-extrabold">
          <span className="text-gradient-ems">Trust Center</span>
        </h1>
        <p className="mt-2 text-white/40">
          Your account security, payout status, and platform protections.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Security score */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <ShieldIcon className="h-6 w-6 text-brand-400" />
            <span className="font-semibold text-white">Account Security</span>
          </div>
          <p className={`text-5xl font-extrabold ${secColor}`}>{secScore}</p>
          <p className={`mt-1 text-sm font-semibold ${secColor}`}>{secLabel}</p>
          <ul className="mt-4 space-y-2 text-sm text-white/50">
            <li className={user.emailVerified ? "text-green-400" : "text-red-400"}>
              {user.emailVerified ? "✓" : "✗"} Email verified
            </li>
            <li className={!user.emailBounced ? "text-green-400" : "text-red-400"}>
              {!user.emailBounced ? "✓" : "✗"} Email deliverable
            </li>
            <li className={user.identityVerifiedAt ? "text-green-400" : "text-white/30"}>
              {user.identityVerifiedAt ? "✓" : "○"} Identity verified (KYC)
            </li>
            <li className={user.suspicionScore === 0 ? "text-green-400" : "text-yellow-400"}>
              {user.suspicionScore === 0 ? "✓" : "!"} No risk flags
            </li>
          </ul>
        </div>

        {/* Payout status */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <DollarIcon className="h-6 w-6 text-brand-400" />
            <span className="font-semibold text-white">Payout Status</span>
          </div>
          <p
            className={`text-lg font-bold ${payoutReady ? "text-green-400" : "text-yellow-400"}`}
          >
            {payoutReady ? "Ready to receive payouts" : "Setup incomplete"}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/50">
            <li className={user.connectChargesEnabled ? "text-green-400" : "text-yellow-400"}>
              {user.connectChargesEnabled ? "✓" : "○"} Charges enabled
            </li>
            <li className={user.connectPayoutsEnabled ? "text-green-400" : "text-yellow-400"}>
              {user.connectPayoutsEnabled ? "✓" : "○"} Payouts enabled
            </li>
            <li
              className={
                user.taxFormStatus === "COLLECTED" ? "text-green-400" : "text-yellow-400"
              }
            >
              {user.taxFormStatus === "COLLECTED" ? "✓" : "○"} Tax form on file (
              {user.taxFormStatus})
            </li>
          </ul>
          {!payoutReady && (
            <a
              href="/settings/payouts"
              className="mt-4 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400 transition"
            >
              Complete setup →
            </a>
          )}
        </div>

        {/* Platform protections */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <BoltIcon className="h-6 w-6 text-brand-400" />
            <span className="font-semibold text-white">Platform Protections</span>
          </div>
          <ul className="space-y-2 text-sm text-white/60">
            <li className="text-green-400">✓ Adult-content promotion blocked at API layer</li>
            <li className="text-green-400">✓ Spam link flooding detection</li>
            <li className="text-green-400">✓ URL shortener cloaking blocked</li>
            <li className="text-green-400">✓ Rate limiting on all submission endpoints</li>
            <li className="text-green-400">✓ Bot fingerprint detection on posts &amp; comments</li>
            <li className="text-green-400">✓ Report queue with {`<`}4h SLA for NSFW</li>
            <li className="text-green-400">✓ Bounce suppression on email delivery</li>
            <li className="text-green-400">✓ Transaction velocity monitoring</li>
          </ul>
        </div>

        {/* Email &amp; notifications */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4 flex items-center gap-3">
            <EnvelopeIcon className="h-6 w-6 text-brand-400" />
            <span className="font-semibold text-white">Email &amp; Notifications</span>
          </div>
          <ul className="space-y-2 text-sm text-white/60">
            <li className={!user.emailBounced ? "text-green-400" : "text-red-400"}>
              {!user.emailBounced ? "✓ Emails delivering normally" : "✗ Email bounced — contact support"}
            </li>
            <li className="text-green-400">✓ Guaranteed delivery via outbox</li>
            <li className="text-green-400">✓ Opt-out controls in settings</li>
            <li>
              <a href="/settings/notifications" className="text-brand-400 underline hover:text-brand-300">
                Manage preferences →
              </a>
            </li>
          </ul>
          <p className="mt-4 text-xs text-white/30">
            Account created {accountAgeDays} day{accountAgeDays !== 1 ? "s" : ""} ago.
          </p>
        </div>
      </div>

      <p className="mt-10 text-center text-xs text-white/25">
        Epic Music Space · Trust &amp; Safety · support@epicmusicspace.com
      </p>
    </main>
  );
}
