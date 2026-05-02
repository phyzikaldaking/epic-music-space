"use client";

import { Suspense, useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const email = params.get("email") ?? "";
  const token = params.get("token") ?? "";
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [resendEmail, setResendEmail] = useState(email);

  useEffect(() => {
    const storageKey = "ems_verify_resend_cooldown_until";
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const until = Number(raw);
    if (!Number.isFinite(until)) return;
    const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    setCooldownLeft(remaining);
  }, []);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  useEffect(() => {
    if (!token || !email) return;
    const verifyUrl = `/api/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    window.location.replace(verifyUrl);
  }, [token, email]);

  async function handleResend() {
    if (!resendEmail || resending || cooldownLeft > 0) return;
    setResending(true);
    setResendError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const retryAfter =
          Number(res.headers.get("Retry-After") ?? data.retryAfterSeconds ?? 0) ||
          0;
        if (retryAfter > 0) {
          const until = Date.now() + retryAfter * 1000;
          window.localStorage.setItem(
            "ems_verify_resend_cooldown_until",
            String(until),
          );
          setCooldownLeft(retryAfter);
        }
        setResendError(
          data.error ?? "Could not resend verification email. Please try again.",
        );
        return;
      }

      const until = Date.now() + 60 * 1000;
      window.localStorage.setItem("ems_verify_resend_cooldown_until", String(until));
      setCooldownLeft(60);
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  if (token && email) {
    return (
      <Card
        icon="🔐"
        title="Verifying your email"
        body="Please wait while we securely verify your account..."
        cta={
          <p className="text-sm text-white/45">
            If this takes too long, click this direct link: <a className="text-brand-400 hover:underline" href={`/api/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`}>verify now</a>
          </p>
        }
      />
    );
  }

  if (error === "invalid") {
    return (
      <Card
        icon="❌"
        title="Invalid link"
        body="This verification link is invalid or has already been used."
        cta={
          <ResendForm
            email={resendEmail}
            setEmail={setResendEmail}
            onResend={handleResend}
            resending={resending}
            resent={resent}
            cooldownLeft={cooldownLeft}
          />
        }
        footerError={resendError}
      />
    );
  }

  if (error === "expired") {
    return (
      <Card
        icon="⏰"
        title="Link expired"
        body="This verification link has expired. Request a new one below."
        cta={
          <ResendForm
            email={resendEmail}
            setEmail={setResendEmail}
            onResend={handleResend}
            resending={resending}
            resent={resent}
            cooldownLeft={cooldownLeft}
          />
        }
        footerError={resendError}
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
          <p>Didn&apos;t receive it?</p>
          <ResendForm
            email={resendEmail}
            setEmail={setResendEmail}
            onResend={handleResend}
            resending={resending}
            resent={resent}
            cooldownLeft={cooldownLeft}
          />
          <p className="text-xs text-white/35">
            Tip: check spam or promotions, and add <span className="text-white/60">noreply@epicmusicspace.com</span> to safe senders.
          </p>
          <p>
            <Link href="/auth/signin" className="text-brand-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      }
      footerError={resendError}
    />
  );
}

function Card({
  icon,
  title,
  body,
  cta,
  footerError,
}: {
  icon: string;
  title: string;
  body: string;
  cta: React.ReactNode;
  footerError?: string;
}) {
  return (
    <div className="flex min-h-[88vh] items-center justify-center px-4">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-500/10 blur-[120px]" />
      <div className="relative w-full max-w-md">
        <div className="glass-card rounded-3xl p-10 text-center shadow-2xl">
          <div className="mb-4 text-5xl">{icon}</div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="mt-3 text-sm text-white/45 leading-relaxed">{body}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 text-left text-xs text-white/60 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Secure checkout</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Clear licensing terms</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Weekly artist payouts</div>
          </div>
          <div className="mt-8">{cta}</div>
          {footerError ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {footerError}
            </p>
          ) : null}
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
  cooldownLeft,
}: {
  email: string;
  setEmail: (v: string) => void;
  onResend: () => void;
  resending: boolean;
  resent: boolean;
  cooldownLeft: number;
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
        disabled={!email || resending || cooldownLeft > 0}
        className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-40"
      >
        {resending
          ? "Sending…"
          : cooldownLeft > 0
            ? `Resend available in ${cooldownLeft}s`
            : "Resend verification email"}
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
