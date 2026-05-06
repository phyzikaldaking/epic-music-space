"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

const STORAGE_KEY = "ems_artist_welcome_dismissed_v1";
const VARIANT_KEY = "ems_artist_welcome_variant_v1";

type WelcomeVariant = "control" | "speedrun";

interface Props {
  hasUploadedSong: boolean;
  hasStudio: boolean;
  payoutsReady: boolean;
}

/**
 * One-time onboarding checklist that appears at the top of /dashboard for new
 * artists. Shows three steps with green checks for what's done. Dismissed
 * permanently once all three are complete (or via the X button).
 */
export default function ArtistWelcomeBanner({
  hasUploadedSong,
  hasStudio,
  payoutsReady,
}: Props) {
  const searchParams = useSearchParams();
  const allDone = hasUploadedSong && hasStudio && payoutsReady;
  const [dismissed, setDismissed] = useState(true);
  const [variant, setVariant] = useState<WelcomeVariant>("control");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (allDone) {
      setDismissed(true);
      return;
    }
    setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, [allDone]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const forced = searchParams.get("welcomeVariant");
    const forcedVariant = forced === "speedrun" || forced === "control" ? forced : null;
    const storedVariant = window.localStorage.getItem(VARIANT_KEY);
    const stored = storedVariant === "speedrun" || storedVariant === "control" ? storedVariant : null;
    const assigned = forcedVariant ?? stored ?? (Math.random() < 0.5 ? "control" : "speedrun");

    window.localStorage.setItem(VARIANT_KEY, assigned);
    setVariant(assigned);

    void postFunnelEvent({
      event: FUNNEL_EVENTS.artistWelcomeVariantAssigned,
      source: "artist_welcome_banner",
      properties: {
        variant: assigned,
        forced: Boolean(forcedVariant),
      },
    });
  }, [searchParams]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }

  const controlSteps = [
    { label: "Claim your studio username", done: hasStudio, href: "/profile/edit" },
    { label: "Upload your first song", done: hasUploadedSong, href: "/studio/new" },
    { label: "Connect Stripe to get paid", done: payoutsReady, href: "/dashboard?connect=start" },
  ];

  const speedrunSteps = [
    { label: "Upload your first song", done: hasUploadedSong, href: "/studio/new" },
    { label: "Connect Stripe to get paid", done: payoutsReady, href: "/dashboard?connect=start" },
    { label: "Claim your studio username", done: hasStudio, href: "/profile/edit" },
  ];

  const steps = variant === "speedrun" ? speedrunSteps : controlSteps;

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="mb-8 rounded-2xl border border-brand-500/30 bg-gradient-to-br from-brand-500/12 via-accent-500/8 to-brand-500/4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">
            {variant === "speedrun" ? "Artist Speedrun" : "Welcome to Epic Music Space"}
          </p>
          <p className="mt-1 text-base font-semibold">
            {completed}/{steps.length} steps to your first payout
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 h-1.5 w-full rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "border border-white/15 text-white/40"
              }`}
            >
              {s.done ? "✓" : "·"}
            </span>
            <span
              className={`flex-1 text-sm ${s.done ? "text-white/40 line-through" : "text-white/85"}`}
            >
              {s.label}
            </span>
            {!s.done && (
              <Link
                href={s.href}
                onClick={() => {
                  if (s.href === "/studio/new") {
                    void postFunnelEvent({
                      event: FUNNEL_EVENTS.artistDashboardToUploadClick,
                      source: "artist_welcome_banner",
                    });
                  }
                }}
                className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold hover:bg-white/20"
              >
                {variant === "speedrun" ? "Do it now" : "Start"}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
