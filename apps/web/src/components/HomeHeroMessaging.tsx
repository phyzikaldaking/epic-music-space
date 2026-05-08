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
        <p className="studio-label text-tube-300">
          ◉ Where the next generation of music gets made
        </p>
        <h1 className="mt-4 font-display text-5xl uppercase leading-[1.02] tracking-wider text-white sm:text-6xl lg:text-7xl">
          Make a record.
          <br />
          <span className="text-tube-300">Sell it tonight.</span>
          <br />
          Keep 100%.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Cut tracks in the browser, drop them in front of fans live, and get
          paid the second someone wants in. No labels, no gatekeepers, no
          monthly subscription to record.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/55">
          Flat 10% platform fee, itemized on every payout —{" "}
          <Link
            href="/pricing"
            className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
          >
            see the breakdown
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <p className="studio-label text-tube-300">
        ◉ Where the next generation of music gets made
      </p>
      <h1 className="mt-4 font-display text-5xl uppercase leading-[1.02] tracking-wider text-white sm:text-6xl lg:text-7xl">
        Record. Release.
        <br />
        <span className="text-tube-300">Get paid live.</span>
        <br />
        Built for artists.
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
        Cut a track in the in-browser studio, drop it into a live listening
        room, battle it head-to-head on{" "}
        <Link
          href="/versus"
          className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
        >
          Versus
        </Link>
        , and get paid the second a fan wants in. Every license is 100%
        yours.
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-white/55">
        Flat 10% platform fee, itemized on every payout —{" "}
        <Link
          href="/pricing"
          className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
        >
          see the breakdown
        </Link>
        .
      </p>
    </>
  );
}
