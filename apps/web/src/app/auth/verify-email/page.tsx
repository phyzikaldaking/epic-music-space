"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const email = params.get("email") ?? "";
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendEmail, setResendEmail] = useState(email);

  async function handleResend() {
    if (!resendEmail || resending) return;
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  if (error === "invalid") {
    return (
      <Card
        icon="❌"
        title="Invalid link"
        body="This verification link is invalid or has already been used."
        cta={<ResendForm email={resendEmail} setEmail={setResendEmail} onResend={handleResend} resending={resending} resent={resent} />}
      />
    );
  }

  if (error === "expired") {
    return (
      <Card
        icon="⏰"
        title="Link expired"
        body="This verification link has expired. Request a new one below."
        cta={<ResendForm email={resendEmail} setEmail={setResendEmail} onResend={handleResend} resending={resending} resent={resent} />}
      />
    );
  }

  return (
    <Card
      icon="📬"
      title="Check your inbox"
      body={`We sent a verification link to ${email || "your email"}. Click the link to activate your account. It expires in 24 hours.`}
      cta={
        <div className="space-y-3 text-center text-sm text-white/40">
          <p>Didn't receive it?</p>
          <ResendForm email={resendEmail} setEmail={setResendEmail} onResend={handleResend} resending={resending} resent={resent} />
          <p>
            <Link href="/auth/signin" className="text-brand-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      }
    />
  );
}

function Card({
  icon,
  title,
  body,
  cta,
}: {
  icon: string;
  title: string;
  body: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[88vh] items-center justify-center px-4">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-500/10 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <div className="glass-card rounded-3xl p-10 text-center shadow-2xl">
          <div className="mb-4 text-5xl">{icon}</div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-3 text-sm text-white/45 leading-relaxed">{body}</p>
          <div className="mt-8">{cta}</div>
        </div>
      </div>
    </div>
  );
}

function ResendForm({
  email,
  setEmail,
  onResend,
  resending,
  resent,
}: {
  email: string;
  setEmail: (v: string) => void;
  onResend: () => void;
  resending: boolean;
  resent: boolean;
}) {
  if (resent) {
    return (
      <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
        Verification email sent! Check your inbox.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/25 focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
      />
      <button
        onClick={onResend}
        disabled={!email || resending}
        className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
      >
        {resending ? "Sending…" : "Resend verification email"}
      </button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
