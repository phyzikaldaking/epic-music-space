"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const STORAGE_KEY = "ems_tour_dismissed_v1";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "Welcome to Epic Music Space",
    body: "Music marketplace, social timeline, live audio rooms, and AI charts — all under one account. This 30-second tour shows you where everything lives.",
  },
  {
    emoji: "🎧",
    title: "Listen & discover",
    body: "Tracks live in /marketplace and /trending. The bottom-right player keeps playing as you navigate. Hit / on your keyboard to search any time. Bookmark anything you like — your /library keeps it organized.",
  },
  {
    emoji: "🎤",
    title: "Upload (artists)",
    body: "If you signed up as an artist or producer, /studio/new takes you to the upload form. Your dashboard shows a 3-step setup checklist on first visit.",
  },
  {
    emoji: "💸",
    title: "Get paid",
    body: "Connect Stripe in /dashboard to receive payouts. License sales settle weekly every Monday. /investors shows live platform GMV.",
  },
  {
    emoji: "💬",
    title: "Talk to anyone",
    body: "Tap an artist's profile → Message to start a thread. /messages shows your inbox with an unread badge on the bottom-nav DMs tab. Block + report controls live in the ⋯ menu of every post.",
  },
  {
    emoji: "🏆",
    title: "Verzuz battles",
    body: "/verzuz hosts 10-round, head-to-head artist showdowns — two artists, ten songs each, fans vote round-by-round. /versus surfaces 1v1 + Battle Royale matches. Stage your own from /verzuz/new.",
  },
  {
    emoji: "⚙️",
    title: "Tune your inbox",
    body: "Don't want a buzz for every like? /settings/notifications has per-type toggles for both in-app and email. /settings/privacy lets you export your data or delete your account anytime.",
  },
];

/**
 * One-shot modal tour for first-time signed-in users. Dismisses permanently
 * on close (localStorage). Listeners and artists see different copy on the
 * upload step but the rest is shared.
 */
export default function OnboardingTour() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    // Tiny delay so it doesn't fight with page-load animations.
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, [session?.user?.id]);

  function dismiss() {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }

  if (!open || !session?.user?.id) return null;

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/12 bg-[#0d0d14] p-6 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-300">
            Step {stepIdx + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/80"
            aria-label="Skip tour"
          >
            Skip
          </button>
        </div>

        <div className="mt-4 text-4xl" aria-hidden>{step.emoji}</div>
        <h2 className="mt-2 text-xl font-extrabold">{step.title}</h2>
        <p className="mt-2 text-sm text-white/60 leading-relaxed">{step.body}</p>

        <div className="mt-6 flex h-1 gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-full flex-1 rounded-full ${
                i <= stepIdx ? "bg-gradient-to-r from-brand-500 to-accent-400" : "bg-white/8"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/8 disabled:opacity-30"
          >
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600"
            >
              Got it
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIdx((i) => i + 1)}
              className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
