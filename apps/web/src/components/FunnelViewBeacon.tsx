"use client";

import { useEffect, useRef } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import type { FunnelEventName } from "@/lib/funnelEvents";

interface Props {
  event: FunnelEventName;
  source: string;
  properties?: Record<string, unknown>;
}

export default function FunnelViewBeacon({ event, source, properties }: Props) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void postFunnelEvent({ event, source, properties });
  }, [event, source, properties]);

  return null;
}
