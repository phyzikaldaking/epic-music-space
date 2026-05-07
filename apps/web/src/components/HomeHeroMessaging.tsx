"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

type HeroVariant = "community" | "outcome";

const STORAGE_KEY = "ems_home_hero_variant_v1";

export default function HomeHeroMessaging() {
  const [variant, setVariant] = useState<HeroVariant>("community");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const selected: HeroVariant =
      stored === "community" || stored === "outcome"
        ? stored
        : Math.random() < 0.5
          ? "community"
          : "outcome";

    window.localStorage.setItem(STORAGE_KEY, selected);
    setVariant(selected);

    void postFunnelEvent({
      event: FUNNEL_EVENTS.homeHeroVariantAssigned,
      source: "home_hero",
      properties: { variant: selected },
    });
  }, []);

  if (variant === "outcome") {
    return (
      <>
        <p className="vc-eyebrow">Where the next generation of music gets made</p>
        <h1 className="vc-hero-h1">
          Make a record.
          <br />
          <span className="accent">Sell it tonight.</span>
          <br />
          Keep 100%.
        </h1>
        <p className="vc-hero-tagline">
          Cut tracks in the browser, drop them in front of fans live, and get
          paid the second someone wants in. No labels, no gatekeepers, no
          monthly subscription to record.
          <span className="block mt-3 text-sm text-white/60">
            Flat 10% platform fee, itemized on every payout —
            {" "}<Link href="/pricing" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">see the breakdown</Link>.
          </span>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="vc-eyebrow">Where the next generation of music gets made</p>
      <h1 className="vc-hero-h1">
        Record. Release.
        <br />
        <span className="accent">Get paid live.</span>
        <br />
        Built for artists.
      </h1>
      <p className="vc-hero-tagline">
        Cut a track in the in-browser studio, drop it into a live listening
        room, battle it head-to-head on{" "}
        <Link href="/versus" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">Versus</Link>
        , and get paid the second a fan wants in. Every license is 100%
        yours.
        <span className="block mt-3 text-sm text-white/60">
          Flat 10% platform fee, itemized on every payout —
          {" "}<Link href="/pricing" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">see the breakdown</Link>.
        </span>
      </p>
    </>
  );
}
