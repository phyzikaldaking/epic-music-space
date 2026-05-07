"use client";

/**
 * Single-field signup for guest publish. Replaces the full /auth/signup
 * gauntlet (name + email + password + role + Turnstile) with a one-input
 * email capture: we send a magic link, they click it, they land back on
 * /studio/new?from=guest-resume authed and the existing GuestResumePublish
 * client finishes the upload from the IndexedDB stash.
 *
 * The visitor never has to set a password (they can do that later in
 * account settings) and never has to choose a role (we auto-assign
 * ARTIST so they can publish on the other side).
 */

import { useEffect, useState } from "react";
import Link from "next/link";

const RESUME_CALLBACK = "/studio/new?from=guest-resume";

export default function GuestSaveClient() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [hasMix, setHasMix] = useState<boolean | null>(null);

  // Sanity-check: confirm there's actually a stashed mix waiting. If not,
  // redirect them back to the studio to make one — capturing an email
  // here with no payload to attach is just lead-gen we don't want.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { readGuestMix } = await import("@/lib/guestStash");
        const entry = await readGuestMix();
        if (!cancelled) setHasMix(Boolean(entry));
      } catch {
        if (!cancelled) setHasMix(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/guest-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl: RESUME_CALLBACK }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't send the link. Try again in a minute.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (hasMix === false) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="text-5xl">🎚️</div>
        <h1 className="mt-4 text-2xl font-extrabold">No saved mix to keep</h1>
        <p className="mt-2 text-sm text-white/60">
          We didn&apos;t find a stashed mix in this browser. Make a beat in the
          studio first, then hit Publish to save it here.
        </p>
        <Link
          href="/studio/try"
          className="mt-6 inline-block rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-6 py-3 text-sm font-bold text-white"
        >
          Open the studio →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-brand-500/10 blur-[130px]" />

      <div className="relative">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">
            🎉 Mix saved
          </div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            Drop your email.
            <br />
            <span className="text-gradient-ems">We&apos;ll keep your mix.</span>
          </h1>
          <p className="mt-3 text-sm text-white/65">
            One email. One link. No password. We&apos;ll send you a sign-in link,
            and your mix is waiting on the other side ready to publish.
          </p>
        </div>

        {sent ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-6 text-center">
            <div className="text-4xl">📬</div>
            <h2 className="mt-3 text-lg font-extrabold">Link sent</h2>
            <p className="mt-2 text-sm text-white/70">
              Check <span className="font-bold text-white">{email}</span>. The
              link expires in 15 minutes. Click it and you&apos;ll land back here
              with your mix uploaded and ready to publish.
            </p>
            <p className="mt-4 text-xs text-white/45">
              Didn&apos;t arrive? Check spam, then{" "}
              <button
                type="button"
                onClick={() => { setSent(false); setError(""); }}
                className="font-semibold text-brand-300 underline decoration-dotted underline-offset-4 hover:text-brand-200"
              >
                request a new one
              </button>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-4 text-base text-white placeholder-white/30 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40"
            />
            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-base font-extrabold text-white shadow-lg shadow-brand-500/30 transition hover:from-brand-400 hover:to-accent-400 disabled:opacity-50"
            >
              {submitting ? "Sending link…" : "Send me the link →"}
            </button>
            <p className="text-center text-[11px] text-white/40">
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline hover:text-white">terms</Link> and{" "}
              <Link href="/privacy" className="underline hover:text-white">privacy policy</Link>.
              You can set a password later in account settings.
            </p>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-white/40">
          Already have an account?{" "}
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(RESUME_CALLBACK)}`}
            className="font-semibold text-brand-300 underline decoration-dotted underline-offset-4 hover:text-brand-200"
          >
            Sign in instead
          </Link>
        </p>
      </div>
    </div>
  );
}
