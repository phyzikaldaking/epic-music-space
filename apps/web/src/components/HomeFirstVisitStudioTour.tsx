"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { postFunnelEvent } from "@/lib/funnelClient";
import { FUNNEL_EVENTS } from "@/lib/funnelEvents";

const STORAGE_KEY = "ems.home.studio-tour.dismissed.v1";

const STEPS = [
  {
    label: "Studio",
    title: "Start in the real DAW",
    body: "Open /studio/try and touch the actual creation surface before signup.",
    href: "/studio/try",
  },
  {
    label: "Publish",
    title: "Save the first idea",
    body: "When the track has a pulse, the save flow captures the session and carries it into signup.",
    href: "/studio/try/save",
  },
  {
    label: "Monetize",
    title: "List, license, and recover checkout",
    body: "The same account can publish, compare license rights, and resume interrupted purchases.",
    href: "/marketplace",
  },
] as const;

export default function HomeFirstVisitStudioTour() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const current = STEPS[step] ?? STEPS[0];

  return (
    <section className="mt-6 rounded-xl border border-tube-300/25 bg-black/35 p-4 text-left shadow-2xl shadow-black/30">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="studio-label text-tube-300">First Visit Tour · Begins In Studio</p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-wider text-white">
            {current.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/62">{current.body}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {STEPS.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setStep(index)}
              className={`rounded-md border px-3 py-2 studio-label transition ${
                index === step
                  ? "border-tube-300/45 bg-tube-300/15 text-tube-100"
                  : "border-white/10 bg-white/5 text-white/50 hover:text-white/75"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={current.href}
          className="studio-engage-btn rounded-md px-4 py-2 font-display text-sm uppercase tracking-[0.16em]"
          onClick={() => {
            void postFunnelEvent({
              event: FUNNEL_EVENTS.homeStudioTourStarted,
              source: "home_first_visit_tour",
              properties: { step: current.label, destination: current.href },
            });
          }}
        >
          Open {current.label} →
        </Link>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              /* best effort */
            }
            setVisible(false);
          }}
          className="rounded-md studio-faceplate-dark px-4 py-2 studio-label text-white/55 hover:text-white/80"
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
