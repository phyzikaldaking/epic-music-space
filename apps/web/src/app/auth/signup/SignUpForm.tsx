"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { sanitizeCallbackPath } from "@/lib/safeCallback";
import { isCapacitorWebView } from "@/lib/runtime";
import TurnstileWidget from "@/components/TurnstileWidget";
import {
  evaluatePassword,
  personalTokensFor,
  MIN_LENGTH as PASSWORD_MIN_LENGTH,
} from "@/lib/passwordStrength";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const ROLES = [
  {
    value: "ARTIST",
    icon: "🎤",
    label: "Artist",
    sub: "Upload songs, earn royalties",
    border: "border-brand-500/50",
    bg: "bg-brand-500/10",
    ring: "ring-brand-500",
    textAccent: "text-brand-400",
  },
  {
    value: "PRODUCER",
    icon: "🎛️",
    label: "Producer",
    sub: "Sell beats, kits, templates",
    border: "border-orange-500/50",
    bg: "bg-orange-500/8",
    ring: "ring-orange-500",
    textAccent: "text-orange-400",
  },
  {
    value: "ENGINEER",
    icon: "🎚️",
    label: "Engineer",
    sub: "Offer mixing & mastering",
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/8",
    ring: "ring-emerald-500",
    textAccent: "text-emerald-400",
  },
  {
    value: "LISTENER",
    icon: "🎧",
    label: "Fan / Listener",
    sub: "Find tracks, back artists",
    border: "border-accent-500/50",
    bg: "bg-accent-500/8",
    ring: "ring-accent-500",
    textAccent: "text-accent-400",
  },
  {
    value: "LABEL",
    icon: "🏷️",
    label: "Label",
    sub: "Sign artists, run a roster",
    border: "border-gold-500/50",
    bg: "bg-gold-500/8",
    ring: "ring-gold-500",
    textAccent: "text-gold-400",
  },
] as const;

type RoleValue = typeof ROLES[number]["value"];

function SignUpContent({
  googleEnabled,
  appleEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedRole, setSelectedRole] = useState<RoleValue>("LISTENER");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [buyerGuide, setBuyerGuide] = useState({
    mood: "Cinematic",
    useCase: "Trailer",
    budget: "$100-$300",
    licenseType: "Social + Ads",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskChecks, setTaskChecks] = useState<Record<string, boolean>>({});

  // Read invite code from URL param
  const inviteCode = searchParams.get("invite") ?? "";
  const callbackUrl = sanitizeCallbackPath(searchParams.get("callbackUrl"));
  const roleDefaultCallback =
    selectedRole === "LISTENER"
      ? "/feed?onboarding=listener"
      : "/studio/setup?next=/studio/new";
  const resolvedCallbackUrl = callbackUrl || roleDefaultCallback;

  // Google blocks OAuth inside Capacitor's WKWebView ("This browser may
  // not be secure"). Hide the Google button in the mobile shell and show
  // a hint pointing to web. Apple OAuth still works in the WebView.
  // Detection has to run client-side because SSR doesn't know about the
  // shell.
  const [hideGoogleForWebView, setHideGoogleForWebView] = useState(false);
  useEffect(() => {
    setHideGoogleForWebView(isCapacitorWebView());
  }, []);
  const showGoogle = (typeof window === "undefined"
    ? true
    : !hideGoogleForWebView);

  // Pre-select role from query param (e.g. ?role=ARTIST from homepage CTA)
  useEffect(() => {
    const r = searchParams.get("role") as RoleValue | null;
    if (r && ROLES.some((ro) => ro.value === r)) setSelectedRole(r);
  }, [searchParams]);

  useEffect(() => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.visitorToSignupView,
      source: "web_signup",
    });
  }, []);

  useEffect(() => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.signupRoleSelected,
      role: selectedRole,
      source: "web_signup",
    });
  }, [selectedRole]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const personalTokens = useMemo(
    () => personalTokensFor({ name: form.name, email: form.email }),
    [form.name, form.email],
  );

  const strength = useMemo(
    () => evaluatePassword(form.password, personalTokens),
    [form.password, personalTokens],
  );

  const passwordsMatch =
    confirmPassword.length > 0 && form.password === confirmPassword;
  const showMatchError =
    confirmTouched && confirmPassword.length > 0 && !passwordsMatch;

  const roleTasks =
    selectedRole === "ARTIST"
      ? ["Create profile", "Upload first song", "Set price"]
      : selectedRole === "PRODUCER"
      ? ["List a beat or template", "Set price", "Connect Stripe payouts"]
      : selectedRole === "ENGINEER"
      ? ["List mix / master service", "Set delivery time", "Connect Stripe payouts"]
      : selectedRole === "LABEL"
      ? ["Create label profile", "Invite first artist", "Launch campaign"]
      : ["Save first search", "Watchlist 3 tracks", "License first track"];

  const completedTasks = roleTasks.filter((task) => taskChecks[task]).length;
  const taskProgressPct = Math.round((completedTasks / roleTasks.length) * 100);
  const taskProgressWidthClass =
    taskProgressPct >= 100 ? "w-full" : taskProgressPct >= 67 ? "w-2/3" : taskProgressPct >= 34 ? "w-1/3" : "w-0";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!strength.acceptable) {
      setError(
        strength.hint ||
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters and mix letters with numbers.`,
      );
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords don't match. Re-type the same password in both fields.");
      return;
    }
    if (!ageConfirmed) {
      setError("You must confirm you are at least 13 years old.");
      return;
    }
    if (!termsAccepted) {
      setError("You must accept the Terms of Service and Privacy Policy.");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete the bot-check below before creating your account.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        confirmPassword,
        role: selectedRole,
        inviteCode: inviteCode || undefined,
        callbackUrl: resolvedCallbackUrl,
        ageConfirmed,
        termsAccepted,
        turnstileToken: turnstileToken ?? undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }

    void postFunnelEvent({
      event: FUNNEL_EVENTS.signupCompleted,
      role: selectedRole,
      source: "web_signup",
      properties: {
        callbackUrl: resolvedCallbackUrl,
        hadInvite: Boolean(inviteCode),
      },
    });

    if (data.autoVerified) {
      // Email failed but account was auto-verified — go straight to sign-in
      router.push(`/auth/signin?accountCreated=1&email=${encodeURIComponent(form.email)}&callbackUrl=${encodeURIComponent(resolvedCallbackUrl)}`);
      return;
    }

    if (data.verificationEmailSent === false) {
      // Email not sent — redirect to verify page with flag so user can resend
      router.push(`/auth/verify-email?email=${encodeURIComponent(form.email)}&emailFailed=1&callbackUrl=${encodeURIComponent(resolvedCallbackUrl)}`);
      return;
    }

    router.push(`/auth/verify-email?email=${encodeURIComponent(form.email)}&callbackUrl=${encodeURIComponent(resolvedCallbackUrl)}`);
  }

  return (
    <div className="flex min-h-[88vh] items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-500/12 blur-[120px]" />

      <div className="relative w-full max-w-lg">
        <div className="glass-card rounded-3xl p-8 shadow-2xl">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-extrabold">
              Join <span className="text-gradient-ems">Epic Music Space</span>
            </h1>
            <p className="mt-2 text-sm text-white/45">
              Free to start — no credit card required
            </p>
            {inviteCode && (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/8 px-3 py-1.5">
                <span className="text-green-400 text-sm">🤝</span>
                <p className="text-xs text-green-300 font-semibold">Invited with code <code>{inviteCode}</code></p>
              </div>
            )}
          </div>

          {/* OAuth — top of page so new users can register with one click. */}
          {(googleEnabled || appleEnabled) && (
            <>
              <div className="mb-6 flex flex-col gap-2.5">
                {appleEnabled && (
                  <button
                    type="button"
                    onClick={() => signIn("apple", { callbackUrl })}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-white/90 transition"
                    aria-label="Continue with Apple"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
                    </svg>
                    Continue with Apple
                  </button>
                )}

                {googleEnabled && showGoogle && (
                  <button
                    type="button"
                    onClick={() => signIn("google", { callbackUrl })}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 py-3 text-sm font-medium hover:bg-white/10 transition"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </button>
                )}
                {googleEnabled && !showGoogle && (
                  <p className="text-center text-[11px] text-white/45">
                    Google sign-in only works on the web — Google blocks it in
                    in-app browsers. Use Apple, or sign up with email below.
                  </p>
                )}
              </div>

              <div className="my-6 flex items-center gap-3 text-white/20">
                <span className="flex-1 border-t border-current" />
                <span className="text-xs">or sign up with email</span>
                <span className="flex-1 border-t border-current" />
              </div>
            </>
          )}

          {/* Role selector */}
          <div className="mb-6">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
              I am a…
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  onClick={() => setSelectedRole(role.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
                    selectedRole === role.value
                      ? `${role.border} ${role.bg} ring-1 ${role.ring}/40`
                      : "border-white/8 bg-white/3 hover:bg-white/6"
                  }`}
                >
                  <span className="text-2xl">{role.icon}</span>
                  <span className={`text-xs font-bold ${selectedRole === role.value ? role.textAccent : "text-white/60"}`}>
                    {role.label}
                  </span>
                  <span className="text-[10px] text-white/35 leading-tight">
                    {role.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
            {selectedRole === "ARTIST" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-300">Artist quick start</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">1. Profile</div>
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">2. Upload</div>
                  <div className="rounded-lg border border-brand-500/25 bg-brand-500/10 px-3 py-2">3. Pricing</div>
                </div>
              </>
            ) : selectedRole === "PRODUCER" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Producer storefront</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">List beats &amp; templates</div>
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">Instant download</div>
                  <div className="rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2">100% to you*</div>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-white/40">
                  *Every sale allocated 100% to you. Flat 10% platform fee per
                  license, itemized on every payout. See{" "}
                  <Link href="/pricing" className="underline decoration-dotted underline-offset-2">/pricing</Link>.
                </p>
              </>
            ) : selectedRole === "ENGINEER" ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Engineer services</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-white/70 sm:grid-cols-3">
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Mixing</div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Mastering</div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">Templates &amp; lessons</div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Buyer guided discovery</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    aria-label="Preferred mood"
                    value={buyerGuide.mood}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, mood: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Cinematic</option>
                    <option>Synthwave</option>
                    <option>Dark Trap</option>
                    <option>Ambient</option>
                  </select>
                  <select
                    aria-label="Primary use case"
                    value={buyerGuide.useCase}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, useCase: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Trailer</option>
                    <option>YouTube</option>
                    <option>Podcast</option>
                    <option>Game</option>
                  </select>
                  <select
                    aria-label="Budget range"
                    value={buyerGuide.budget}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, budget: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>$0-$100</option>
                    <option>$100-$300</option>
                    <option>$300-$700</option>
                    <option>$700+</option>
                  </select>
                  <select
                    aria-label="License type"
                    value={buyerGuide.licenseType}
                    onChange={(e) => setBuyerGuide((prev) => ({ ...prev, licenseType: e.target.value }))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
                  >
                    <option>Social + Ads</option>
                    <option>Broadcast</option>
                    <option>Exclusive</option>
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/marketplace"
                    className="rounded-lg border border-accent-500/35 bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-300 hover:bg-accent-500/20"
                  >
                    One-click sample pack
                  </Link>
                  <Link
                    href="/marketplace"
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"
                  >
                    Featured stems in 60 seconds
                  </Link>
                </div>
              </>
            )}

            <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-white/55">
                <span className="uppercase tracking-[0.16em]">First session checklist</span>
                <span>{taskProgressPct}%</span>
              </div>
              <div className="mb-3 h-1.5 w-full rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all ${taskProgressWidthClass}`}
                />
              </div>
              <div className="space-y-2">
                {roleTasks.map((task) => (
                  <label key={task} className="flex items-center gap-2 text-sm text-white/75">
                    <input
                      type="checkbox"
                      checked={Boolean(taskChecks[task])}
                      onChange={(e) =>
                        setTaskChecks((prev) => ({
                          ...prev,
                          [task]: e.target.checked,
                        }))
                      }
                    />
                    <span>{task}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/15 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Name
              </label>
              <input
                type="text"
                name="name"
                autoComplete="name"
                autoCapitalize="words"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-base text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Email
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-base text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
                Phone (optional)
              </label>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-base text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                placeholder="+15551234567"
              />
              <p className="mt-1 text-xs text-white/45">Use international format. We only use this for secure login codes.</p>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-semibold uppercase tracking-widest text-white/40"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[11px] font-semibold text-white/55 hover:text-white/85 focus:outline-none focus-visible:underline"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <input
                id="signup-password"
                type={showPassword ? "text" : "password"}
                name="new-password"
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck={false}
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                onKeyUp={(e) =>
                  setCapsLockOn(e.getModifierState && e.getModifierState("CapsLock"))
                }
                aria-describedby="signup-password-meter signup-password-checks"
                className={`w-full rounded-xl border bg-white/4 px-4 py-3 text-base text-white placeholder-white/25 transition focus:outline-none focus:ring-1 ${
                  passwordTouched && !strength.acceptable
                    ? "border-red-500/45 focus:border-red-400 focus:ring-red-400/40"
                    : "border-white/10 focus:border-brand-500/60 focus:ring-brand-500/40"
                }`}
                placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              />

              {capsLockOn && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                  <span aria-hidden>⚠</span> Caps Lock is on
                </p>
              )}

              {form.password.length > 0 && (
                <>
                  <div
                    id="signup-password-meter"
                    className="mt-2 flex items-center gap-2"
                    aria-live="polite"
                  >
                    <div className="flex h-1.5 flex-1 gap-1">
                      {[1, 2, 3, 4].map((step) => {
                        const reached = step <= strength.score;
                        const color =
                          strength.score <= 1
                            ? "bg-red-500"
                            : strength.score === 2
                              ? "bg-amber-400"
                              : strength.score === 3
                                ? "bg-lime-400"
                                : "bg-emerald-400";
                        return (
                          <span
                            key={step}
                            className={`h-1.5 flex-1 rounded-full transition ${
                              reached ? color : "bg-white/8"
                            }`}
                          />
                        );
                      })}
                    </div>
                    <span
                      className={`min-w-[3.25rem] text-right text-[11px] font-bold uppercase tracking-widest ${
                        strength.score <= 1
                          ? "text-red-300"
                          : strength.score === 2
                            ? "text-amber-300"
                            : strength.score === 3
                              ? "text-lime-300"
                              : "text-emerald-300"
                      }`}
                    >
                      {strength.label}
                    </span>
                  </div>

                  <ul
                    id="signup-password-checks"
                    className="mt-2 grid grid-cols-1 gap-y-0.5 sm:grid-cols-2"
                  >
                    {strength.requirements.map((req) => (
                      <li
                        key={req.id}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          req.met ? "text-emerald-300" : "text-white/45"
                        }`}
                      >
                        <span aria-hidden className="font-bold">
                          {req.met ? "✓" : "•"}
                        </span>
                        {req.label}
                      </li>
                    ))}
                  </ul>

                  {strength.hint && (
                    <p className="mt-1 text-[11px] text-white/55">{strength.hint}</p>
                  )}
                </>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="signup-confirm"
                  className="block text-xs font-semibold uppercase tracking-widest text-white/40"
                >
                  Confirm password
                </label>
                {confirmPassword.length > 0 && (
                  <span
                    className={`text-[11px] font-bold ${
                      passwordsMatch ? "text-emerald-300" : "text-red-300"
                    }`}
                    aria-live="polite"
                  >
                    {passwordsMatch ? "✓ Matches" : "✕ Doesn't match"}
                  </span>
                )}
              </div>
              <input
                id="signup-confirm"
                type={showPassword ? "text" : "password"}
                name="confirm-password"
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck={false}
                required
                minLength={PASSWORD_MIN_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setConfirmTouched(true)}
                className={`w-full rounded-xl border bg-white/4 px-4 py-3 text-base text-white placeholder-white/25 transition focus:outline-none focus:ring-1 ${
                  showMatchError
                    ? "border-red-500/45 focus:border-red-400 focus:ring-red-400/40"
                    : passwordsMatch
                      ? "border-emerald-500/45 focus:border-emerald-400 focus:ring-emerald-400/40"
                      : "border-white/10 focus:border-brand-500/60 focus:ring-brand-500/40"
                }`}
                placeholder="Re-type your password"
              />
              {showMatchError && (
                <p className="mt-1 text-[11px] text-red-300">
                  These don&apos;t match yet.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-xs text-white/65">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span>I&apos;m at least 13 years old.</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-white/65">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span>
                I&apos;ve read and agree to the{" "}
                <Link href="/terms" target="_blank" className="text-brand-400 hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-brand-400 hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>

            {(() => {
              // Live "what's missing" helper. The button below is always
              // enabled (unless we're already submitting) so the user can
              // click it at any time and the existing handleSubmit path
              // will surface the same specific error inline. Showing the
              // missing item here is the proactive version.
              const missing = !form.name.trim()
                ? "Add your name."
                : !form.email.trim()
                  ? "Add your email."
                  : form.password.length === 0
                    ? "Pick a password."
                    : !strength.acceptable
                      ? strength.hint || "Make the password a little stronger."
                      : confirmPassword.length === 0
                        ? "Re-type your password to confirm."
                        : !passwordsMatch
                          ? "The two passwords don't match."
                          : !ageConfirmed
                            ? "Confirm you're at least 13."
                            : !termsAccepted
                              ? "Accept the Terms to continue."
                              : null;
              return missing ? (
                <p className="-mt-1 text-center text-xs text-amber-300/85">
                  ⚠ {missing}
                </p>
              ) : null;
            })()}
            {turnstileEnabled && (
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={(t) => setTurnstileToken(t)}
                onExpire={() => setTurnstileToken(null)}
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-brand-500 py-3 font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 glow-purple-sm"
            >
              {loading ? "Creating account…" : "Create account →"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/35">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-brand-400 hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-4 text-center text-xs text-white/20">
            By creating an account you agree to our{" "}
            <Link href="/legal/terms" className="underline hover:text-white/45">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="underline hover:text-white/45">
              Privacy Policy
            </Link>
            .
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-white/60 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Secure checkout</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Plain-language license terms</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Weekly payout schedule</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpForm({
  googleEnabled,
  appleEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
}) {
  return (
    <Suspense>
      <SignUpContent googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
    </Suspense>
  );
}
