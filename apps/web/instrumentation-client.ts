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
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

if (typeof window !== "undefined" && POSTHOG_TOKEN) {
  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    // Use the reverse-proxy-friendly capture endpoint. PostHog ingestion
    // doesn't need a separate session-recording host with these defaults.
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    // Don't fire dev/preview traffic into the prod project; gated by env.
    loaded: (ph) => {
      if (process.env.NODE_ENV !== "production") ph.opt_out_capturing();
    },
    // Disable session recording by default — it's chatty + has privacy
    // implications. Flip on in PostHog dashboard if needed.
    disable_session_recording: true,
  });
}
