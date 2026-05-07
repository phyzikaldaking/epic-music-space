"use client";

import Link from "next/link";
import { useEffect } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

interface StudioHubClientProps {
  studioUsername: string | null;
}

export default function StudioHubClient({ studioUsername }: StudioHubClientProps) {
  const hasStudio = Boolean(studioUsername);
  const recommendedDestination = hasStudio
    ? `/studio/${studioUsername}`
    : "/studio/setup?next=%2Fstudio%2Fnew";

  useEffect(() => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.studioRootDestinationAssigned,
      source: "studio_root",
      properties: {
        hasStudio,
        recommendedDestination,
      },
    });
  }, [hasStudio, recommendedDestination]);

  const trackClick = (cta: string, href: string) => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.studioRootCtaClick,
      source: "studio_root",
      properties: {
        cta,
        href,
        hasStudio,
      },
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300/85">
          Studio Hub
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Your creator control room
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60">
          Upload new tracks, open live rooms, and manage your studio profile from one place.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {hasStudio ? (
            <Link
              href={`/studio/${studioUsername}`}
              onClick={() => trackClick("my_studio", `/studio/${studioUsername}`)}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold text-white/85 transition hover:bg-white/10"
            >
              Open My Studio
            </Link>
          ) : (
            <Link
              href="/studio/setup?next=%2Fstudio%2Fnew"
              onClick={() => trackClick("complete_setup", "/studio/setup?next=%2Fstudio%2Fnew")}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/15"
            >
              Complete Studio Setup
            </Link>
          )}

          <Link
            href="/studio/new"
            onClick={() => trackClick("quick_upload", "/studio/new")}
            className="rounded-xl bg-brand-500 px-5 py-4 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            Start Quick Upload
          </Link>

          <Link
            href="/studio/new?expert=1"
            onClick={() => trackClick("expert_upload", "/studio/new?expert=1")}
            className="rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Open Advanced Upload Form
          </Link>

          <Link
            href="/studio/live"
            onClick={() => trackClick("live_rooms", "/studio/live")}
            className="rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Browse or Host Live Rooms
          </Link>
        </div>
      </div>
    </div>
  );
}
