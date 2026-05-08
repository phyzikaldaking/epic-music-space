"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import posthog from "posthog-js";

/**
 * Tells PostHog who the current user is so events get attached to the
 * right person in the dashboard. Otherwise every event would land under
 * the anonymous distinct_id PostHog assigns at first pageview, and we'd
 * lose the "user X funnel" view entirely.
 *
 * Mirror of SentryUserBridge — kept as a separate component so each
 * observability tool's identification logic stays readable.
 */
export default function PostHogIdentityBridge() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

    if (status === "authenticated" && session?.user?.id) {
      // Identify with the Prisma user id. Email is added as a property —
      // PostHog hashes / pseudonymizes per project settings, and we want
      // analyst access without exposing raw addresses everywhere.
      posthog.identify(session.user.id, {
        email: session.user.email ?? undefined,
        role: session.user.role ?? undefined,
        subscriptionTier: session.user.subscriptionTier ?? undefined,
      });
    } else if (status === "unauthenticated") {
      // Reset clears the persisted distinct_id so the next pageview gets
      // a fresh anonymous id. Important on shared devices.
      posthog.reset();
    }
  }, [status, session?.user?.id, session?.user?.email, session?.user?.role, session?.user?.subscriptionTier]);

  return null;
}
