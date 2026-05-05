"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import * as Sentry from "@sentry/nextjs";

/**
 * Mirrors the NextAuth session into Sentry's scope so client-side errors
 * + replays come tagged with the actual user. Anonymous on signed-out
 * sessions. PII discipline: id only, no email or name — those only get
 * attached if the project explicitly opts in.
 */
export default function SentryUserBridge() {
  const { data: session, status } = useSession();
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: session.user.id, segment: session.user.role });
  }, [status, session?.user?.id, session?.user?.role]);
  return null;
}
