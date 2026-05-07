"use client";

import Link from "next/link";
import { useEffect } from "react";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

interface StudioHubClientProps {
  studioUsername: string | null;
}

export default function StudioHubClient({ studioUsername }: StudioHubClientProps) {
  const hasStudio = Boolean(studioUsername);
  const recommendedDestination = hasStudio
    ? `/studio/${studioUsername}`
    : "/studio/setup?next=%2Fstudio%2Fnew";

  useEffect(() => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.studioRootDestinationAssigned,
      source: "studio_root",
      properties: {
        hasStudio,
        recommendedDestination,
      },
    });
  }, [hasStudio, recommendedDestination]);

  const trackClick = (cta: string, href: string) => {
    void postFunnelEvent({
      event: FUNNEL_EVENTS.studioRootCtaClick,
      source: "studio_root",
      properties: {
        cta,
        href,
        hasStudio,
      },
    });
  };

  const actions = [
    hasStudio
      ? {
          href: `/studio/${studioUsername}`,
          label: "Open My Studio",
          icon: "🏠",
          onClick: () => trackClick("my_studio", `/studio/${studioUsername}`),
        }
      : {
          href: "/studio/setup?next=%2Fstudio%2Fnew",
          label: "Complete Studio Setup",
          icon: "⚙️",
          onClick: () => trackClick("complete_setup", "/studio/setup?next=%2Fstudio%2Fnew"),
          variant: "amber" as const,
        },
    {
      href: "/studio/board",
      label: "Beat Board (DAW)",
      icon: "🥁",
      onClick: () => trackClick("beat_board", "/studio/board"),
      variant: "accent" as const,
    },
    {
      href: "/studio/new",
      label: "Quick Upload",
      icon: "⚡",
      onClick: () => trackClick("quick_upload", "/studio/new"),
      variant: "brand" as const,
    },
    {
      href: "/studio/new?expert=1",
      label: "Advanced Upload",
      icon: "📋",
      onClick: () => trackClick("expert_upload", "/studio/new?expert=1"),
    },
    {
      href: "/studio/live",
      label: "Live Sessions",
      icon: "🎙️",
      onClick: () => trackClick("live_rooms", "/studio/live"),
    },
  ];

  const getButtonClasses = (variant?: string) => {
    const base = "rounded-xl px-5 py-4 text-sm font-semibold transition";
    switch (variant) {
      case "amber":
        return `${base} border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15`;
      case "brand":
        return `${base} bg-brand-500 text-white hover:bg-brand-600`;
      case "accent":
        return `${base} border border-accent-500/40 bg-gradient-to-br from-accent-500/15 via-brand-500/10 to-transparent text-accent-100 hover:from-accent-500/25 hover:to-brand-500/20`;
      default:
        return `${base} border border-white/15 bg-white/5 text-white/80 hover:bg-white/10`;
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300/85">
          Studio Hub
        </p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">
          Your creator control room
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/60">
          Upload new tracks, open live rooms, and manage your studio profile from one place.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={action.onClick}
            className={getButtonClasses(action.variant)}
          >
            <span className="mr-2">{action.icon}</span>
            {action.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <FeatureCard
          icon="🎧"
          title="In-Browser DAW"
          body="7 drum kits, multitrack recorder, EQ, compression, and a master chain with limiter."
          href="/studio/board"
          onClick={() => trackClick("feature_daw", "/studio/board")}
        />
        <FeatureCard
          icon="⚡"
          title="90-Second Publish"
          body="Drop audio, name it, set your license price. Three taps to the marketplace."
          href="/studio/new"
          onClick={() => trackClick("feature_upload", "/studio/new")}
        />
        <FeatureCard
          icon="👥"
          title="Live Listening"
          body="Host or join real-time listening sessions. Fans license tracks while they play."
          href="/studio/live"
          onClick={() => trackClick("feature_live", "/studio/live")}
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
  href,
  onClick,
}: {
  icon: string;
  title: string;
  body: string;
  href: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-brand-500/30 hover:bg-white/[0.05]"
    >
      <div className="text-3xl">{icon}</div>
      <p className="mt-3 text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm text-white/55">{body}</p>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-brand-300 group-hover:text-brand-200">
        Open →
      </p>
    </Link>
  );
}
