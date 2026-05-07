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
        <p className="vc-eyebrow">The fastest-growing social platform for music</p>
        <h1 className="vc-hero-h1">
          Go Viral Faster.
          <br />
          <span className="accent">Build fans in public.</span>
          <br />
          Get paid in real time.
        </h1>
        <p className="vc-hero-tagline">
          Epic Music Space helps artists turn discovery into momentum. Host live
          sessions, win fan-voted battles, and convert engagement into revenue
          without waiting on gatekeepers.
          <span className="block mt-2">
            Every track can move from first listen to first supporter in one
            flow across rooms, feeds, and charts.
          </span>
          <span className="block mt-3 text-sm text-white/60">
            Transparent payouts: only a flat 10% platform fee, itemized on every
            payment. See full breakdown on{" "}
            <Link href="/pricing" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">
              /pricing
            </Link>
            .
          </span>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="vc-eyebrow">The fastest-growing social platform for music</p>
      <h1 className="vc-hero-h1">
        Connect. Compete. Create.
        <br />
        <span className="accent">Earn as you share.</span>
        <br />
        Go viral tonight.
      </h1>
      <p className="vc-hero-tagline">
        Epic Music Space is where millions of fans discover music and artists
        build careers. Host live listening rooms with real-time fan engagement,
        compete in{" "}
        <Link href="/versus" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">
          community-powered battles
        </Link>
        , and earn 100% of every license sale with zero hidden cuts.
        <span className="block mt-2">
          Share your music, grow your fanbase, and monetize your community in
          real time. Every play, every share, every battle positions you for
          viral success.
        </span>
        <span className="block mt-3 text-sm text-white/60">
          Transparent payouts: only a flat 10% platform fee, itemized on every
          payment. See full breakdown on{" "}
          <Link href="/pricing" className="accent underline decoration-dotted underline-offset-4 hover:no-underline">
            /pricing
          </Link>
          .
        </span>
      </p>
    </>
  );
}
