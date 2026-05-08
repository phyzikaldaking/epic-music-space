// Next.js 15+ resolves the client-side instrumentation entry from
// instrumentation-client.ts (the legacy sentry.client.config.ts is
// silently ignored on newer versions). We re-export the existing config
// from the same module so DSN / sampling tweaks have a single source of
// truth.
export * from "./sentry.client.config";
import "./sentry.client.config";
import { initBotId } from "botid/client/core";
import posthog from "posthog-js";

initBotId({
  protect: [
    { path: "/api/auth/register", method: "POST" },
    { path: "/api/posts", method: "POST" },
    { path: "/api/dmca", method: "POST" },
    { path: "/api/checkout", method: "POST" },
    { path: "/api/payments/create-checkout", method: "POST" },
    { path: "/api/stripe/checkout", method: "POST" },
  ],
});

// PostHog client-side analytics. Without this, the codebase only has the
// server-side posthog-node SDK that fires from individual API routes —
// no pageviews, no autocaptured clicks, no funnels. This wires the
// browser SDK so we can finally see where real users go.
//
// Token is the public NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN; the SDK is safe
// to expose to the browser. Honors do-not-track and respects the cookie
// consent banner via posthog.opt_out_capturing() / opt_in() hooks the
// CookieConsent component will eventually wire in.
const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

// PostHog has two host families and they are NOT interchangeable:
//   • us.posthog.com           — dashboard UI + feature flags
//   • us.i.posthog.com         — ingest endpoint (events, replays, etc.)
// `init()` MUST point at the `.i.` ingest host or no events get captured.
// We had NEXT_PUBLIC_POSTHOG_HOST set to "https://us.posthog.com" in
// production env (the dashboard host), so the SDK loaded fine, fetched
// flags, and then silently dropped every capture call. Hardcoding the
// correct ingest host here makes the SDK resilient to env-var drift —
// the flags-host without `.i.` is auto-derived by the SDK from this.
const POSTHOG_HOST = "https://us.i.posthog.com";

if (typeof window !== "undefined" && POSTHOG_TOKEN) {
  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    // PostHog auto-derives the dashboard host (us.posthog.com) from
    // api_host for feature-flag evaluation, so we don't need to set
    // ui_host explicitly when api_host is the standard ingest URL.
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    // Disable session recording by default — it's chatty + has privacy
    // implications. Flip on in PostHog dashboard if needed.
    disable_session_recording: true,
  });
  // We previously gated dev/preview here with opt_out_capturing(), but
  // process.env.NODE_ENV gets dead-code-eliminated at build time, which
  // either always-no-ops or always-opts-out depending on which build
  // the bundle came from. Cleaner: gate on hostname at runtime, which
  // survives DCE and works in any deployment target.
  if (
    typeof location !== "undefined" &&
    !/(?:^|\.)epicmusicspace\.com$/i.test(location.hostname)
  ) {
    posthog.opt_out_capturing();
  }
}
