"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

type Placement = "hero" | "closing";
type CtaCopyVariant = "identity" | "action";

const STORAGE_KEY = "ems_home_cta_copy_variant_v1";

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
  const [copyVariant, setCopyVariant] = useState<CtaCopyVariant>("identity");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const selected: CtaCopyVariant =
      stored === "identity" || stored === "action"
        ? stored
        : Math.random() < 0.5
          ? "identity"
          : "action";

    window.localStorage.setItem(STORAGE_KEY, selected);
    setCopyVariant(selected);

    void postFunnelEvent({
      event: FUNNEL_EVENTS.homeCtaCopyVariantAssigned,
      source: `home_split_cta_${placement}`,
      properties: { variant: selected },
    });
  }, [placement]);

  const artistLabel =
    copyVariant === "identity" ? "I\'m an Artist" : "Create as Artist";
  const listenerLabel =
    copyVariant === "identity" ? "I\'m a Listener" : "Discover as Listener";

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
        {artistLabel} →
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
        {listenerLabel} →
      </Link>
    </div>
  );
}
