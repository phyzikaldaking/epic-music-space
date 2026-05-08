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
    const base =
      "flex min-h-[58px] items-center gap-3 rounded-xl px-5 py-4 text-base font-semibold transition active:scale-[0.99]";
    switch (variant) {
      case "amber":
        return `${base} border border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15`;
      case "brand":
        return `${base} bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-lg shadow-brand-500/20 hover:opacity-95`;
      case "accent":
        return `${base} border border-accent-500/40 bg-gradient-to-br from-accent-500/15 via-brand-500/10 to-transparent text-accent-100 hover:from-accent-500/25 hover:to-brand-500/20`;
      default:
        return `${base} border border-white/15 bg-white/5 text-white/85 hover:bg-white/10`;
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:py-12">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(125deg,rgba(13,15,28,0.98),rgba(9,17,24,0.94)_46%,rgba(30,15,35,0.88))] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-brand-500/20 blur-[140px]" />

        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-200/80">
          Studio Hub
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
          Build, mix, and publish from one timeline.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-white/70 sm:text-base">
          Fast path for new releases, full DAW for detailed sessions, and live rooms when you want immediate fan feedback.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <WorkflowChip idx="01" title="Capture" body="Quick Upload or multitrack board" />
          <WorkflowChip idx="02" title="Shape" body="EQ, compression, FX, loudness" />
          <WorkflowChip idx="03" title="Ship" body="Publish to catalog and timeline" />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            onClick={action.onClick}
            className={getButtonClasses(action.variant)}
          >
            <span className="text-xl leading-none" aria-hidden>{action.icon}</span>
            <span>{action.label}</span>
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

      {/* ── Publish checklist reminder ──────────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-cyan-200/75">
          Publish Checklist
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            "Cover art uploaded",
            "Track title & artist name set",
            "Genre + BPM / key tagged",
            "Preview clip trimmed (best 30s)",
            "License type selected",
            "Price set",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-white/60">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/20 text-[10px]">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
        <Link
          href="/studio/new"
          onClick={() => trackClick("checklist_publish", "/studio/new")}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:opacity-95"
        >
          ⚡ Publish a Track
        </Link>
      </div>

      {/* ── "What do you want to do next?" cross-platform strip ────────── */}
      <div className="mt-6">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-white/40">
          Keep Moving
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { href: "/versus", icon: "⚔️", label: "Enter a Battle", sub: "Submit a track to the 1v1 floor" },
            { href: "/studio/live", icon: "🎙️", label: "Open a Session", sub: "Go live and let fans in the room" },
            { href: "/timeline", icon: "📰", label: "Check Timeline", sub: "See what the community is doing" },
          ].map(({ href, icon, label, sub }) => (
            <Link
              key={href}
              href={href}
              onClick={() => trackClick(`keep_moving_${href.replace("/", "")}`, href)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-white/20 hover:bg-white/6"
            >
              <span className="text-xl leading-none" aria-hidden>{icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/90">{label}</p>
                <p className="text-xs text-white/40">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkflowChip({ idx, title, body }: { idx: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/12 bg-black/25 px-4 py-3">
      <p className="text-[10px] font-black tracking-[0.18em] text-cyan-200/75">{idx}</p>
      <p className="mt-1 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-white/55">{body}</p>
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
