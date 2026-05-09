"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

type HeroVariant = "artist_os" | "licensing";

const STORAGE_KEY = "ems_home_hero_variant_v2";

export default function HomeHeroMessaging() {
  const [variant, setVariant] = useState<HeroVariant>("artist_os");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const selected: HeroVariant =
      stored === "artist_os" || stored === "licensing"
        ? stored
        : Math.random() < 0.5
          ? "artist_os"
          : "licensing";

    window.localStorage.setItem(STORAGE_KEY, selected);
    setVariant(selected);

    void postFunnelEvent({
      event: FUNNEL_EVENTS.homeHeroVariantAssigned,
      source: "home_hero",
      properties: { variant: selected },
    });
  }, []);

  if (variant === "licensing") {
    return (
      <>
        <p className="studio-label text-tube-300">
          ◉ Clear rights. Real artists. Instant momentum.
        </p>
        <h1 className="mt-4 font-display text-5xl uppercase leading-[1.02] tracking-wider text-white sm:text-6xl lg:text-7xl">
          License music fast.
          <br />
          <span className="text-tube-300">Back artists early.</span>
          <br />
          Know the terms.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
          Browse tracks by genre, BPM, key, score, price, and license supply.
          Preview before checkout, see the rights in plain English, and support
          creators without hidden terms.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-white/55">
          Digital music licenses are not equity or securities —{" "}
          <Link
            href="/legal/licensing"
            className="font-semibold text-tube-400 underline decoration-dotted underline-offset-4 hover:text-tube-300"
          >
            review the agreement
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <p className="studio-label text-tube-300">
        ◉ The artist operating system for releases, fans, and revenue
      </p>
      <h1 className="mt-4 font-display text-5xl uppercase leading-[1.02] tracking-wider text-white sm:text-6xl lg:text-7xl">
        Launch your music.
        <br />
        <span className="text-tube-300">Build your fanbase.</span>
        <br />
        Sell licenses.
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
        Record in the browser, publish from your studio, host live listening
        rooms, battle for chart momentum, and turn attention into clear digital
        licensing revenue from one command center.
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-white/55">
        You own your master. EMS takes a flat 10% platform fee, itemized on every payout —{" "}
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
