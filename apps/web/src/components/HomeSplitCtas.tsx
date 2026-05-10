"use client";

import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

type Placement = "hero" | "closing";

interface HomeSplitCtasProps {
  placement: Placement;
  containerClassName?: string;
  artistClassName: string;
  listenerClassName: string;
}

export default function HomeSplitCtas({
  placement,
  containerClassName,
  artistClassName,
  listenerClassName,
}: HomeSplitCtasProps) {
  if (placement === "hero") {
    return (
      <div className={containerClassName}>
        <Link
          href="/studio/try"
          className={artistClassName}
          onClick={() => {
            void postFunnelEvent({
              event: FUNNEL_EVENTS.homeSplitCtaClick,
              role: "ARTIST",
              source: "home_primary_studio_cta",
              properties: { placement, destination: "/studio/try" },
            });
          }}
        >
          Open the Studio Free →
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
          <Link
            href="/marketplace"
            className="underline decoration-dotted underline-offset-4 hover:text-white/75"
            onClick={() => {
              void postFunnelEvent({
                event: FUNNEL_EVENTS.homeSplitCtaClick,
                role: "LISTENER",
                source: "home_secondary_marketplace_cta",
                properties: { placement, destination: "/marketplace" },
              });
            }}
          >
            Browse catalog
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/auth/signup?role=ARTIST"
            className="underline decoration-dotted underline-offset-4 hover:text-white/75"
            onClick={() => {
              void postFunnelEvent({
                event: FUNNEL_EVENTS.homeSplitCtaClick,
                role: "ARTIST",
                source: "home_secondary_signup_cta",
                properties: { placement, destination: "/auth/signup?role=ARTIST" },
              });
            }}
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <Link
        href="/auth/signup?role=ARTIST"
        className={artistClassName}
        onClick={() => {
          void postFunnelEvent({
            event: FUNNEL_EVENTS.homeSplitCtaClick,
            role: "ARTIST",
            source: "home_split_cta",
            properties: { placement },
          });
        }}
        >
        Start as Artist →
      </Link>
      <Link
        href="/auth/signup?role=LISTENER"
        className={listenerClassName}
        onClick={() => {
          void postFunnelEvent({
            event: FUNNEL_EVENTS.homeSplitCtaClick,
            role: "LISTENER",
            source: "home_split_cta",
            properties: { placement },
          });
        }}
        >
        Explore as Listener →
      </Link>
    </div>
  );
}
