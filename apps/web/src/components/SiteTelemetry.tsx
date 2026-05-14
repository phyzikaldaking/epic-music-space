"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useEffect } from "react";

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export default function SiteTelemetry() {
  useEffect(() => {
    const posthogKey = readEnv("NEXT_PUBLIC_POSTHOG_KEY");
    const posthogHost = readEnv("NEXT_PUBLIC_POSTHOG_HOST") ?? "https://us.i.posthog.com";
    if (!posthogKey) return;

    let cancelled = false;
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || posthog.__loaded) return;
      posthog.init(posthogKey, {
        api_host: posthogHost,
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true,
        person_profiles: "identified_only",
        loaded: (client) => client.capture("ems_site_boot", { surface: "web", release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "local" }),
      });
    }).catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
