"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SpotlightTour, { type SpotlightStep } from "@/components/daw/SpotlightTour";

const STORAGE_KEY = "ems.studio.try.tour.dismissed.v3";

const SPOTLIGHT_STEPS: readonly SpotlightStep[] = [
  {
    target: "play-button",
    title: "Press Play",
    body: "Start audio playback. Same button doubles as Stop while playing. Keyboard: Space.",
  },
  {
    target: "record-button",
    title: "Arm and record",
    body: "Click any track's red ● button to arm it, then hit Record. The take captures into that track.",
  },
  {
    target: "bpm-input",
    title: "Set the tempo",
    body: "Type a BPM and press Enter. Or use Tap (T) to find the feel by tapping the beat with your finger.",
  },
  {
    target: "add-sounds-cta",
    title: "Add your own sounds",
    body: "Click here, drag files anywhere on the studio, or paste audio. Each file becomes a new track.",
  },
  {
    target: "beat-grid",
    title: "Build a beat",
    body: "Click steps to fire each drum lane. Try the Suggest button to drop a fresh pattern that fits your kit + BPM.",
  },
  {
    target: "track-strip",
    title: "Mix this track",
    body: "Solo isolates the track. Mute silences it. The knobs are EQ low/mid/high. Hover any of them — every control has a tip.",
  },
  {
    target: "master-panel",
    title: "Master the mix",
    body: "Watch LUFS and true peak here. Pick a mastering preset (streaming, club, broadcast) before you publish.",
  },
  {
    target: "coach-bubble",
    title: "Stuck? Ask the Coach",
    body: "The bot reads your session — BPM, kit, tracks. Ask anything: \"Why does my mix sound muddy?\" or \"What does this knob do?\"",
    action: {
      label: "Open Studio Coach",
      onClick: () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("studio:open-coach"));
        }
      },
    },
  },
];

const STEPS = [
  {
    label: "1. Make",
    title: "Touch a control surface first",
    body: "Hit pads, record a take, tweak a knob. This page is the real studio, not a demo video.",
    hint: "On mobile, try the 4-pad PhoneStudio. On desktop, the full DAW loads below.",
  },
  {
    label: "2. Upload",
    title: "Drop your own sounds",
    body: "Drag any WAV, MP3, or FLAC onto the studio — we auto-create one track per file. Or hit the “+ Add sounds” button at the top.",
    hint: "Watch for the amber overlay when you drag in a file.",
  },
  {
    label: "3. Mix",
    title: "Solo, EQ, compress — the basics",
    body: "Click a track to focus it. Hover any knob, fader, or pad to see what it does — every control has a tip now.",
    hint: "Tooltips explain every control. Try hovering Mute, Solo, or the EQ knobs.",
  },
  {
    label: "4. Save",
    title: "Save when the track has a pulse",
    body: "We only ask for an account when you want to keep the session. That’s the right moment.",
    hint: "Use the Save flow to stash your work and resume after signup.",
  },
  {
    label: "5. Publish",
    title: "Publish into the marketplace loop",
    body: "Once it’s live, buyers compare rights and you keep 100% of each sale with a flat 10% platform fee itemized on payout.",
    hint: "You can always return to the studio and iterate.",
  },
  {
    label: "6. Coach",
    title: "Stuck? Ask the Studio Coach",
    body: "The chat bubble in the corner reads your project — BPM, kit, tracks — and answers questions like “why does my mix sound muddy?” or “what does this knob do?”.",
    hint: "It’s a real LLM, not a canned bot. Sign in first to use it.",
  },
] as const;

export default function StudioFirstVisitTour({ isAuthed }: { isAuthed: boolean }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  useEffect(() => {
    if (isAuthed) return;
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, [isAuthed]);

  if (!visible || isAuthed) return null;
  const current = STEPS[step] ?? STEPS[0];

  return (
    <>
      <SpotlightTour
        steps={SPOTLIGHT_STEPS}
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
      />
      {!open ? (
        <div className="fixed bottom-4 right-4 z-40">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="studio-engage-btn rounded-full px-5 py-3 font-display text-sm uppercase tracking-[0.18em] shadow-2xl shadow-black/40"
          >
            First session guide →
          </button>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(860px,calc(100%-24px))] rounded-xl border border-tube-300/20 bg-black/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="studio-label text-tube-300">Studio First-Visit Tour</p>
              <p className="mt-1 font-display text-xl uppercase tracking-wide text-white">{current.title}</p>
              <p className="mt-2 text-sm leading-6 text-white/65">{current.body}</p>
              <p className="mt-1 text-xs text-white/45">{current.hint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {STEPS.map((s, idx) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setStep(idx)}
                  className={`rounded-md border px-3 py-2 studio-label transition ${
                    idx === step
                      ? "border-tube-300/45 bg-tube-300/15 text-tube-100"
                      : "border-white/10 bg-white/5 text-white/50 hover:text-white/75"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSpotlightOpen(true);
              }}
              className="rounded-md border border-tube-300/45 bg-tube-300/15 px-4 py-2 font-display text-sm uppercase tracking-[0.16em] text-tube-100 transition hover:bg-tube-300/25"
            >
              ✨ Spotlight tour
            </button>
            {current.label.startsWith("6.") ? (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("studio:open-coach"));
                  }
                }}
                className="studio-engage-btn rounded-md px-4 py-2 font-display text-sm uppercase tracking-[0.16em]"
              >
                Open Studio Coach →
              </button>
            ) : null}
            <Link
              href="/studio/try/save"
              className="studio-engage-btn rounded-md px-4 py-2 font-display text-sm uppercase tracking-[0.16em]"
            >
              Save / Continue →
            </Link>
            <Link
              href="/marketplace"
              className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-white/55 hover:text-white/80"
            >
              Browse marketplace →
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto rounded-md px-3 py-2 studio-label text-white/45 hover:bg-white/5 hover:text-white/75"
            >
              Minimize
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(STORAGE_KEY, "1");
                } catch {
                  /* ignore */
                }
                setVisible(false);
              }}
              className="rounded-md px-3 py-2 studio-label text-white/45 hover:bg-white/5 hover:text-white/75"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
