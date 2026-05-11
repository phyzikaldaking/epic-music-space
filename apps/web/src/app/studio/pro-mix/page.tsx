"use client";

import Link from "next/link";
import ProMixWindow from "@/components/daw/ProMixWindow";

const demoSnapshot = {
  tracks: [
    {
      id: "vocal",
      name: "Lead Vocal",
      color: "#ec4899",
      level: 0.34,
      gainDb: -3,
      pan: 0,
      muted: false,
      solo: false,
      armed: true,
      fx: {
        eqLowDb: -1.5,
        eqMidDb: 1.2,
        eqHighDb: 2.5,
        compEnabled: true,
        vocalBusEnabled: true,
        reverbWet: 0.18,
        delayWet: 0.12,
      },
    },
    {
      id: "beat",
      name: "Beat Bus",
      color: "#22d3ee",
      level: 0.62,
      gainDb: -5,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      fx: {
        eqLowDb: 1,
        eqMidDb: -0.5,
        eqHighDb: 0,
        compEnabled: true,
        vocalBusEnabled: false,
        reverbWet: 0.08,
        delayWet: 0.04,
      },
    },
    {
      id: "808",
      name: "808 / Bass",
      color: "#a78bfa",
      level: 0.72,
      gainDb: -4,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      fx: {
        eqLowDb: 2.2,
        eqMidDb: -1,
        eqHighDb: -2,
        compEnabled: true,
        vocalBusEnabled: false,
        reverbWet: 0.02,
        delayWet: 0,
      },
    },
    {
      id: "fx",
      name: "FX / Adlibs",
      color: "#f59e0b",
      level: 0.2,
      gainDb: -8,
      pan: 0.18,
      muted: false,
      solo: false,
      armed: false,
      fx: {
        eqLowDb: -3,
        eqMidDb: 0,
        eqHighDb: 1.4,
        compEnabled: false,
        vocalBusEnabled: true,
        reverbWet: 0.34,
        delayWet: 0.28,
      },
    },
  ],
  transport: {
    bpm: 94,
    isPlaying: false,
    masterDb: -2,
    masterLevel: 0.68,
    masterLufs: -13.8,
    masterTruePeak: 0.82,
    masterPhaseCorrelation: 0.74,
    masterLimiterOn: true,
  },
  aux: {
    reverbReturn: { enabled: true, level: 0.28 },
    delayReturn: { enabled: true, level: 0.2 },
  },
};

export default function ProMixPreviewPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.45em] text-cyan-200/70">Epic Music Space</p>
            <h1 className="mt-2 text-3xl font-black md:text-4xl">Professional Mix Window Preview</h1>
            <p className="mt-2 max-w-3xl text-sm text-white/60">
              This route safely previews the new console-first mixer on current main before the full Studio Board integration lands.
            </p>
          </div>
          <Link
            href="/studio/board"
            className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-5 py-3 text-sm font-black uppercase tracking-[0.25em] text-cyan-100 hover:bg-cyan-300/20"
          >
            Back to Studio Board
          </Link>
        </div>

        <ProMixWindow
          snapshot={demoSnapshot}
          focusedId="vocal"
          onFocusTrack={() => undefined}
        />
      </div>
    </main>
  );
}
