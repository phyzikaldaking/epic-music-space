"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Mirrors the NextAuth session into Sentry's scope so client-side errors
 * + replays come tagged with the actual user. Anonymous on signed-out
 * sessions. PII discipline: id only, no email or name — those only get
 * attached if the project explicitly opts in.
 */
export default function SentryUserBridge() {
  const { data: session, status } = useSession();
  useEffect(() => {
    let cancelled = false;
    async function syncSentryUser() {
      const Sentry = await import("@sentry/browser");
      if (cancelled) return;

      if (status !== "authenticated" || !session?.user?.id) {
        Sentry.setUser(null);
        return;
      }

      Sentry.setUser({ id: session.user.id, segment: session.user.role });
    }

    void syncSentryUser();
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, session?.user?.role]);
  return null;
}
