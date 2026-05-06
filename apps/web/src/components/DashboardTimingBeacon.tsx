"use client";

import { useEffect, useRef } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

export default function DashboardTimingBeacon() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const routeInteractiveMs = Math.round(performance.now());

    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistDashboardViewTiming,
      source: "dashboard_route",
      properties: {
        routeInteractiveMs,
        domContentLoadedMs: navEntry ? Math.round(navEntry.domContentLoadedEventEnd) : undefined,
        responseStartMs: navEntry ? Math.round(navEntry.responseStart) : undefined,
      },
    });
  }, []);

  return null;
}
