"use client";

import { useState, Suspense, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { appendCallbackParam, sanitizeCallbackPath } from "@/lib/safeCallback";
import { isCapacitorWebView } from "@/lib/runtime";
import TurnstileWidget from "@/components/TurnstileWidget";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function SignInContent({
  googleEnabled,
  appleEnabled,
  phoneEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
  phoneEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const verified = params.get("verified") === "true";
  const accountCreated = params.get("accountCreated") === "1";
  const reset = params.get("reset");
  const resetSuccess = reset === "1" || reset === "ok";
  const oauthError = params.get("error") ?? "";
  const callbackUrl = sanitizeCallbackPath(params.get("callbackUrl"));

  // Capacitor's WKWebView is an "embedded WebView" — Google explicitly
  // blocks OAuth in that environment with a "This browser may not be
  // secure" error. Apple sign-in works inside the WebView. So we hide
  // Google when inside the mobile shell and surface a hint that
  // explains where it lives. Detection has to run client-side because
  // SSR doesn't know about the shell.
  const [hideGoogleForWebView, setHideGoogleForWebView] = useState(false);
  useEffect(() => {
    setHideGoogleForWebView(isCapacitorWebView());
  }, []);
  const showGoogle = (typeof window === "undefined"
    ? true
    : !hideGoogleForWebView);

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkSending, setMagicLinkSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "apple" | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // When the Turnstile env var is unset, we treat the gate as disabled
  // and the form behaves exactly as before. Once the deploy has the key,
  // submit is gated on a solved challenge token.
  const turnstileEnabled = Boolean(TURNSTILE_SITE_KEY);

  // Map every NextAuth-surfaced error to a specific actionable message.
  // The previous catch-all "Sign-in failed. Please try again." was a
  // dead-end for users who hit OAuthCallback (configuration), Verification
  // (expired email link), AccessDenied (provider rejected), etc.
  const oauthErrorMessage = oauthError
    ? oauthErrorCopy(oauthError)
    : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (turnstileEnabled && !turnstileToken) {
      setError("Please complete the bot-check below before signing in.");
      setLoading(false);
      return;
    }

    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result =
        mode === "email"
          ? await signIn("credentials", {
              email,
              password,
              turnstileToken: turnstileToken ?? "",
              redirect: false,
            })
          : await signIn("phone-otp", {
              phone,
              code: phoneCode,
              turnstileToken: turnstileToken ?? "",
              redirect: false,
            });
    } catch {
      setError("Sign-in is taking longer than expected. Check your connection and try again.");
      setLoading(false);
      return;
    }

    // NextAuth v5 returns `result.error` as a string code on failure. On
    // success it can return either `{ ok: true, error: null }` or a
    // `{ url }` shape — never assume the absence of `error` means success.
    // We additionally probe `/api/auth/session` so we never navigate to a
    // signed-in destination unless the cookie actually committed.
    if (result?.error || (!result?.ok && !result?.url)) {
      // NextAuth v5 surfaces the CredentialsSignin subclass `code` field
      // on result.code in beta.25+. Older releases left it only in the
      // redirect URL — parse that as a fallback so the error mapping
      // doesn't silently collapse to "Invalid email or password" for
      // every specific failure case (rate-limited / unverified / etc.)
      // the way it did before.
      let urlCode: string | null = null;
      try {
        if (result.url && typeof window !== "undefined") {
          urlCode = new URL(result.url, window.location.origin).searchParams.get("code");
        }
      } catch {
        /* result.url missing or not parseable */
      }
      const authCode = (
        ("code" in result ? (result as { code?: unknown }).code : undefined) ??
        urlCode ??
        result.error ??
        ""
      )
        .toString()
        .toLowerCase();

      if (mode === "phone") {
        if (authCode.includes("rate_limited")) {
          setError("Too many sign-in attempts. Wait a minute, then request a fresh code.");
        } else if (authCode.includes("account_suspended")) {
          setError("This account is restricted. Contact support for help.");
        } else {
          setError("Invalid or expired code. Request a new code and try again.");
        }
      } else if (authCode.includes("turnstile")) {
        setError("Bot-check didn't pass. Re-solve the challenge below and try again.");
        setTurnstileToken(null);
      } else if (authCode.includes("email_not_verified")) {
        setError("Your email still needs verification, but that should not block sign-in anymore. Try once more; if it keeps happening, use the email link option below.");
      } else if (authCode.includes("rate_limited")) {
        setError("Too many sign-in attempts. Please wait a minute and try again.");
      } else if (authCode.includes("account_suspended")) {
        setError("This account is restricted. Contact support for help.");
      } else {
        setError("Email or password didn't match. Try again, or use Forgot password.");
      }
      setLoading(false);
    } else {
      // Confirm the session cookie actually committed before we navigate.
      // NextAuth's `signIn(redirect:false)` resolves before the browser has
      // necessarily flushed the Set-Cookie response from /api/auth/callback,
      // and a tiny minority of browsers race with the next request. A
      // single GET to /api/auth/session warms the cookie jar and tells us
      // whether we have a session id we can trust.
      let sessionConfirmed = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        try {
          const sessionRes = await fetch("/api/auth/session", {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (sessionRes.ok) {
            const sessionData = (await sessionRes.json().catch(() => null)) as
              | { user?: { id?: string } | null }
              | null;
            sessionConfirmed = Boolean(sessionData?.user);
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          // Timeout or network error — still proceed with navigation
          // since the signIn succeeded; the cookie is likely there.
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            console.warn("Session confirmation timed out, proceeding with navigation");
          }
        }
      } catch {
        /* unexpected error — fall through to hard nav anyway */
      }

      if (!sessionConfirmed) {
        // Cookie didn't show up. Most common cause: third-party-cookie
        // blockers + cross-origin Set-Cookie. Surface a clear, actionable
        // error instead of bouncing the user to a signed-out landing page.
        setError(
          "Signed in, but your browser didn't accept the session cookie. " +
            "Disable strict tracking protection for this site (or try a " +
            "different browser) and sign in again.",
        );
        setLoading(false);
        return;
      }

      // Hard-navigate so every server component on the next page renders
      // with the new cookie. router.refresh()+router.push() races with the
      // RSC payload cache and occasionally lands users on a signed-out
      // version of their destination.
      // Add a 50ms microtask delay to ensure Set-Cookie is flushed in
      // browsers that batch microtasks before the request is sent.
      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.assign(callbackUrl);
        }, 50);
      } else {
        router.push(callbackUrl);
      }
    }
  }

  function oauthErrorCopy(code: string): string {
    // NextAuth v5 + Auth.js core error codes plus our app-specific ones.
    // Anything else falls through to a generic but still-actionable line.
    switch (code) {
      case "OAuthAccountNotLinked":
        return "This email already has a different sign-in method. Use your original method (password or the other provider), then link this one from your account settings.";
      case "AccessDenied":
        return "Sign-in was cancelled or rejected by the provider. Try again, or use a different sign-in method.";
      case "Verification":
        return "That sign-in link expired or was already used. Request a fresh one and click it within 24 hours.";
      case "OAuthCallback":
      case "OAuthSignin":
      case "OAuthCreateAccount":
        return "Couldn't complete sign-in with that provider. Refresh and try again, or use a different method.";
      case "Configuration":
        return "Sign-in is temporarily misconfigured. Try again in a minute, or use a different provider.";
      case "CredentialsSignin":
        return "Email or password didn't match. Try again, or use Forgot password.";
      case "account_suspended":
        return "This account is restricted. Contact support for help.";
      case "magic_link_invalid":
        return "That sign-in link is invalid or has expired. Request a fresh one below.";
      case "SessionRequired":
        return "You need to be signed in for that.";
      default:
        return "Sign-in failed. Please try again, or use a different method below.";
    }
  }

  async function handleGoogleSignIn() {
    setOauthLoading("google");
    setError("");

    try {
      // Google sign-in uses a top-level redirect here, not a popup. The real
      // client-side failure modes are embedded browsers and blocked cookies.
      if (isCapacitorWebView()) {
        setError(
          "Google sign-in is blocked inside this in-app browser. Open Epic Music Space in Safari or Chrome, or use Apple, email, or phone instead.",
        );
        setOauthLoading(null);
        return;
      }

      let canSetCookies = false;
      try {
        document.cookie = "ems_google_probe=1; Max-Age=60; Path=/; SameSite=Lax";
        canSetCookies = document.cookie.includes("ems_google_probe=1");
        document.cookie = "ems_google_probe=; Max-Age=0; Path=/; SameSite=Lax";
      } catch {
        canSetCookies = false;
      }

      if (!navigator.cookieEnabled || !canSetCookies) {
        setError(
          "Your browser is blocking third-party cookies, which are required for sign-in. " +
          "Disable strict tracking protection for this site and try again."
        );
        setOauthLoading(null);
        return;
      }

      await signIn("google", { redirectTo: callbackUrl });
    } catch (err) {
      console.error("Google sign-in error:", err);
      setError("Google sign-in encountered an error. Please try a different method.");
      setOauthLoading(null);
    }
  }

  async function handleSendMagicLink() {
    setError("");
    setMagicLinkSent(false);

    if (!email || !/.+@.+\..+/.test(email)) {
      setError("Enter your email above first, then we'll send the sign-in link.");
      return;
    }

    setMagicLinkSending(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Could not send the sign-in link. Please try again.",
        );
      } else {
        // Always render the same success state regardless of whether the
        // account exists — the API mirrors that to avoid email enumeration.
        setMagicLinkSent(true);
      }
    } catch {
      setError("Could not send the sign-in link. Please try again.");
    } finally {
      setMagicLinkSending(false);
    }
  }

  async function handleRequestPhoneCode() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/phone/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Could not send a login code. Please try again.");
      } else {
        setPhoneCodeSent(true);
      }
    } catch {
      setError("Could not send a login code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl p-8">
          <h1 className="mb-2 text-2xl font-extrabold">Sign in</h1>
          <p className="mb-6 text-sm text-white/50">
            Welcome back to Epic Music Space
          </p>

          {accountCreated && (
            <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              Account created! Enter your password to sign in.
            </div>
          )}

          {verified && (
            <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              Email verified! You can now sign in.
            </div>
          )}

          {resetSuccess && (
            <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
              Password updated. Sign in with your new password.
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
              {error.includes("needs verification") && (
                <div className="mt-2">
                  <a
                    href={`/auth/verify-email?email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
                    className="underline hover:text-red-300"
                  >
                    Resend link
                  </a>
                  <span className="ml-2 text-red-300/80">and check spam/promotions folder.</span>
                </div>
              )}
            </div>
          )}

          {oauthErrorMessage && !error && (
            <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-3 text-sm text-red-400">
              {oauthErrorMessage}
              {(oauthError === "OAuthCallback" || oauthError === "OAuthSignin" || oauthError === "OAuthCreateAccount") && googleEnabled && showGoogle && (
                <button
                  type="button"
                  onClick={() => { setOauthLoading("google"); signIn("google", { redirectTo: callbackUrl }); }}
                  disabled={oauthLoading !== null}
                  className="mt-2 block text-xs underline hover:text-red-300 disabled:opacity-50"
                >
                  {oauthLoading === "google" ? "Redirecting…" : "Try Google again"}
                </button>
              )}
            </div>
          )}

          {phoneEnabled && (
            <div className="mb-4 grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("email");
                  setError("");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "email" ? "bg-white text-black" : "text-white/70 hover:bg-white/10"
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("phone");
                  setError("");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  mode === "phone" ? "bg-white text-black" : "text-white/70 hover:bg-white/10"
                }`}
              >
                Phone code
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "email" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-base text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-medium text-white/70">Password</label>
                    <a href="/auth/forgot-password" className="text-xs text-brand-300 hover:underline">
                      Forgot?
                    </a>
                  </div>
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-base text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">Phone number</label>
                  <input
                    type="tel"
                    name="phone"
                    autoComplete="tel"
                    inputMode="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-base text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="+15551234567"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRequestPhoneCode}
                  disabled={loading || !phone}
                  className="rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60 transition"
                >
                  {phoneCodeSent ? "Resend code" : "Send login code"}
                </button>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-white/70">6-digit code</label>
                  <input
                    type="text"
                    name="phone-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    required
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-base text-white placeholder-white/30 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="123456"
                  />
                </div>
              </>
            )}
            {turnstileEnabled && (
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={(t) => setTurnstileToken(t)}
                onExpire={() => setTurnstileToken(null)}
              />
            )}
            <button
              type="submit"
              disabled={loading || (mode === "phone" && !phoneCodeSent)}
              className="rounded-xl bg-brand-500 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition"
            >
              {loading ? "Signing in…" : mode === "phone" ? "Sign in with code" : "Sign in"}
            </button>
          </form>

          {mode === "email" && (
            <div className="mt-3">
              {magicLinkSent ? (
                <MagicLinkSuccess email={email} onResend={handleSendMagicLink} resending={magicLinkSending} />
              ) : (
                <button
                  type="button"
                  onClick={handleSendMagicLink}
                  disabled={magicLinkSending || !email}
                  className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60 transition"
                >
                  {magicLinkSending ? "Sending link…" : "Email me a sign-in link instead"}
                </button>
              )}
            </div>
          )}

          {(appleEnabled || googleEnabled) && (
            <>
              <div className="my-6 flex items-center gap-3 text-white/20">
                <span className="flex-1 border-t border-current" />
                <span className="text-xs">or</span>
                <span className="flex-1 border-t border-current" />
              </div>

              <div className="flex flex-col gap-2.5">
                {appleEnabled && (
                  <button
                    type="button"
                    onClick={() => { setOauthLoading("apple"); signIn("apple", { redirectTo: callbackUrl }); }}
                    disabled={oauthLoading !== null || loading}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60 transition"
                    aria-label="Continue with Apple"
                  >
                    {oauthLoading === "apple" ? (
                      <span className="h-4 w-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11Z" />
                      </svg>
                    )}
                    {oauthLoading === "apple" ? "Redirecting…" : "Continue with Apple"}
                  </button>
                )}

                {googleEnabled && showGoogle && (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={oauthLoading !== null || loading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 py-3 text-sm font-medium hover:bg-white/10 disabled:opacity-60 transition"
                  >
                    {oauthLoading === "google" ? (
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    )}
                    {oauthLoading === "google" ? "Redirecting…" : "Continue with Google"}
                  </button>
                )}
                {googleEnabled && !showGoogle && (
                  <p className="text-center text-[11px] text-white/45">
                    Google sign-in works best on the web — some in-app browsers may not support it. 
                    Try Apple, email, or phone instead.
                  </p>
                )}
              </div>
            </>
          )}

          <p className="mt-6 text-center text-sm text-white/40">
            Don&apos;t have an account?{" "}
            <a href={appendCallbackParam("/auth/signup", callbackUrl)} className="text-brand-400 hover:underline">
              Sign up
            </a>
          </p>

          {/* Escape hatch for tire-kickers — let them poke around the studio
              without committing to an account first. They'll be asked for an
              email when they hit save/publish, which is the right moment. */}
          <div className="mt-3 text-center">
            <a
              href="/studio/try"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/55 underline decoration-dotted underline-offset-4 hover:text-white"
            >
              <span aria-hidden>↳</span> Just looking? Try the studio without an account
            </a>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 text-xs text-white/60 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Secure checkout</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Clear licensing terms</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Weekly payout schedule</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MagicLinkSuccess({
  email,
  onResend,
  resending,
}: {
  email: string;
  onResend: () => void | Promise<void>;
  resending: boolean;
}) {
  // Show a 30-second cooldown before allowing resend so the API rate
  // limiter doesn't 429 a panicked user mashing the button.
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
        If an account matches <span className="font-semibold">{email}</span>, a one-time sign-in link is on its way. Check your inbox (and spam) — links expire in 15 minutes.
      </div>
      <button
        type="button"
        onClick={() => {
          if (secondsLeft > 0) return;
          setSecondsLeft(30);
          void onResend();
        }}
        disabled={resending || secondsLeft > 0}
        className="w-full rounded-xl border border-white/10 bg-white/5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50 transition"
      >
        {resending
          ? "Resending…"
          : secondsLeft > 0
            ? `Didn't get it? Resend in ${secondsLeft}s`
            : "Didn't get it? Resend the link"}
      </button>
    </div>
  );
}

function SignInFallback() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 bg-gradient-to-br from-brand-900 to-card">
      <div className="w-full max-w-md space-y-4">
        <div className="glass rounded-3xl p-8 animate-pulse">
          {/* Header skeleton */}
          <div className="h-8 w-32 rounded-lg bg-white/10 mb-2" />
          <div className="h-4 w-48 rounded-lg bg-white/10 mb-6" />
          
          {/* Email input skeleton */}
          <div className="space-y-3 mb-4">
            <div className="h-4 w-16 rounded bg-white/10" />
            <div className="h-10 w-full rounded-xl bg-white/10" />
          </div>
          
          {/* Password input skeleton */}
          <div className="space-y-3 mb-4">
            <div className="h-4 w-20 rounded bg-white/10" />
            <div className="h-10 w-full rounded-xl bg-white/10" />
          </div>
          
          {/* Submit button skeleton */}
          <div className="h-10 w-full rounded-xl bg-brand-500/30" />
        </div>
        <p className="text-center text-xs text-white/40">Loading sign-in…</p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="glass rounded-3xl p-8">
          <h1 className="mb-2 text-2xl font-extrabold">Sign in</h1>
          <p className="mb-6 text-sm text-white/50">Welcome back to Epic Music Space</p>
          <div className="space-y-4">
            <div className="h-11 w-full animate-pulse rounded-xl bg-white/6" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-white/6" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-white/8" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInForm({
  googleEnabled,
  appleEnabled,
  phoneEnabled,
}: {
  googleEnabled: boolean;
  appleEnabled: boolean;
  phoneEnabled: boolean;
}) {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent
        googleEnabled={googleEnabled}
        appleEnabled={appleEnabled}
        phoneEnabled={phoneEnabled}
      />
    </Suspense>
  );
}
