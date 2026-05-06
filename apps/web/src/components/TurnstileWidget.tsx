"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Cloudflare site key from NEXT_PUBLIC_TURNSTILE_SITE_KEY. */
  siteKey: string | null | undefined;
  /** Fires when Turnstile produces a verification token. */
  onVerify: (token: string) => void;
  /** Fires when the token expires or fails. */
  onExpire?: () => void;
  /** Optional theme — auto, light, dark. Defaults to dark to match the form. */
  theme?: "auto" | "light" | "dark";
  /** Optional class for the widget container. */
  className?: string;
}

type TurnstileGlobal = {
  render(
    container: HTMLElement | string,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      retry?: "auto" | "never";
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
};

/**
 * Cloudflare Turnstile widget. When `siteKey` is null or empty (env var
 * not configured) we render nothing — the page just behaves as it did
 * before the gate was added.
 *
 * Loads the Turnstile script via next/script with afterInteractive so
 * it doesn't block page hydration, and mounts the widget once the global
 * `turnstile` object is available.
 */
export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  theme = "dark",
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!siteKey) return;
    if (!scriptReady) return;
    const container = containerRef.current;
    if (!container) return;
    const turnstile = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
    if (!turnstile) return;

    // Mount once. If the parent re-renders we keep the same widget.
    if (widgetIdRef.current) return;
    widgetIdRef.current = turnstile.render(container, {
      sitekey: siteKey,
      callback: (token) => onVerify(token),
      "expired-callback": () => onExpire?.(),
      "error-callback": () => onExpire?.(),
      theme,
      retry: "auto",
    });

    return () => {
      const t = (window as unknown as { turnstile?: TurnstileGlobal }).turnstile;
      if (t && widgetIdRef.current) {
        try {
          t.remove(widgetIdRef.current);
        } catch {
          /* widget already torn down */
        }
        widgetIdRef.current = null;
      }
    };
    // siteKey/theme intentionally not in deps — re-mounting the widget
    // mid-flow loses the user's solved challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />
      <div
        ref={containerRef}
        className={className ?? "mt-2 flex justify-center"}
        aria-label="Bot check"
      />
    </>
  );
}
