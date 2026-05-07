"use client";

import type { ReactElement } from "react";

/**
 * Visual gear rack for the EMS DAW. The audio under each gear card is
 * the platform-native Web Audio chain — these styled cards are honest
 * representations, not faked emulations. Clicking applies a recommended
 * preset to the FX chain of the supplied track.
 *
 *   • U87 Microphone — represents the active mic input. Triggers
 *     record-arm on the supplied track.
 *   • Avalon 737 — vocal chain preset (slight low-cut, mid presence,
 *     gentle compression, plate reverb).
 *   • Pultec EQP-1A — boosting low + air preset (low shelf +3,
 *     high shelf +3, comp off).
 *   • Lexicon 480L — long hall reverb preset (decay 4s, wet 0.35).
 */

interface GearPreset {
  id: string;
  name: string;
  subtitle: string;
  era: string;
  /** Preset to apply via the FxPanel setters when clicked. */
  apply: (fns: GearApplyHandlers) => void;
  /** Inline SVG glyph — keeps the rack zero-asset. */
  Glyph: () => ReactElement;
}

export interface GearApplyHandlers {
  onArm: () => void;
  onSetEq: (band: "low" | "mid" | "high", db: number) => void;
  onSetComp: (params: { threshDb?: number; ratio?: number; enabled?: boolean }) => void;
  onSetReverb: (params: { wet?: number; decaySec?: number }) => void;
  onSetDelay: (params: { wet?: number; beats?: number; feedback?: number }) => void;
}

const PRESETS: GearPreset[] = [
  {
    id: "u87",
    name: "U87",
    subtitle: "Mic input · arms track",
    era: "Studio standard",
    apply: ({ onArm }) => onArm(),
    Glyph: () => (
      <svg viewBox="0 0 100 140" className="h-20 w-auto" aria-hidden="true">
        <defs>
          <linearGradient id="u87a" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d4d4d4" />
            <stop offset="1" stopColor="#5b5b5b" />
          </linearGradient>
        </defs>
        <rect x="32" y="10" width="36" height="46" rx="6" fill="url(#u87a)" stroke="#000" strokeOpacity="0.5" />
        <pattern id="u87grid" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="none" />
          <circle cx="2" cy="2" r="0.6" fill="#1c1c1c" />
        </pattern>
        <rect x="34" y="13" width="32" height="40" rx="3" fill="url(#u87grid)" />
        <rect x="44" y="56" width="12" height="40" rx="2" fill="#3a3a3a" />
        <rect x="36" y="96" width="28" height="6" rx="1" fill="#1f1f1f" />
        <rect x="34" y="102" width="32" height="14" rx="2" fill="#0d0d0d" />
        <text x="50" y="113" fontSize="6" textAnchor="middle" fill="#c0c0c0" fontFamily="ui-monospace, monospace">U 87</text>
      </svg>
    ),
  },
  {
    id: "avalon",
    name: "Avalon 737",
    subtitle: "Vocal chain · EQ + comp + warm",
    era: "Class-A tube",
    apply: ({ onSetEq, onSetComp, onSetReverb }) => {
      onSetEq("low", -2);
      onSetEq("mid", 1.5);
      onSetEq("high", 2);
      onSetComp({ enabled: true, threshDb: -22, ratio: 4 });
      onSetReverb({ wet: 0.18, decaySec: 1.6 });
    },
    Glyph: () => (
      <svg viewBox="0 0 160 80" className="h-20 w-auto" aria-hidden="true">
        <defs>
          <linearGradient id="avalon-bg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#5a4a32" />
            <stop offset="1" stopColor="#2b2419" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="156" height="76" rx="3" fill="url(#avalon-bg)" stroke="#0a0700" />
        <rect x="6" y="6" width="148" height="68" rx="2" fill="#1a1410" stroke="#caa063" strokeOpacity="0.4" />
        {[24, 56, 88, 120].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="40" r="13" fill="#0c0907" stroke="#caa063" strokeWidth="1" />
            <circle cx={cx} cy="40" r="9" fill="#1f1813" />
            <line x1={cx} y1="32" x2={cx} y2="40" stroke="#f5d490" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        ))}
        <text x="80" y="72" fontSize="7" textAnchor="middle" fill="#caa063" fontFamily="ui-monospace, monospace" letterSpacing="2">AVALON</text>
      </svg>
    ),
  },
  {
    id: "pultec",
    name: "Pultec EQP-1A",
    subtitle: "Lows + air · classic curve",
    era: "Vintage tube EQ",
    apply: ({ onSetEq, onSetComp }) => {
      onSetEq("low", 3);
      onSetEq("mid", 0);
      onSetEq("high", 3);
      onSetComp({ enabled: false });
    },
    Glyph: () => (
      <svg viewBox="0 0 160 80" className="h-20 w-auto" aria-hidden="true">
        <rect x="2" y="2" width="156" height="76" rx="3" fill="#1c1208" stroke="#daa54f" strokeOpacity="0.45" />
        <rect x="6" y="6" width="148" height="20" rx="2" fill="#3b270d" stroke="#daa54f" strokeOpacity="0.3" />
        <text x="80" y="20" fontSize="9" textAnchor="middle" fill="#f4d28a" fontFamily="ui-serif, serif" letterSpacing="3">PULTEC</text>
        {[28, 60, 100, 132].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="50" r="12" fill="#0a0703" stroke="#daa54f" />
            <line x1={cx} y1="42" x2={cx + 4} y2="50" stroke="#f4d28a" strokeWidth="1.2" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    id: "lexicon",
    name: "Lexicon 480L",
    subtitle: "Long hall · cinematic tail",
    era: "Reverb classic",
    apply: ({ onSetReverb }) => {
      onSetReverb({ wet: 0.35, decaySec: 4 });
    },
    Glyph: () => (
      <svg viewBox="0 0 160 80" className="h-20 w-auto" aria-hidden="true">
        <rect x="2" y="2" width="156" height="76" rx="3" fill="#0d1525" stroke="#3b82f6" strokeOpacity="0.45" />
        <rect x="10" y="14" width="80" height="20" rx="2" fill="#000" stroke="#3b82f6" strokeOpacity="0.55" />
        <text x="14" y="29" fontSize="11" fill="#7dd3fc" fontFamily="ui-monospace, monospace">HALL · 4.0s</text>
        {Array.from({ length: 18 }).map((_, i) => (
          <rect
            key={i}
            x={10 + i * 4.5}
            y={48 - Math.sin(i / 2) * 8 - 4}
            width="3"
            height={Math.sin(i / 2) * 8 + 6 + 4}
            fill="#7dd3fc"
            opacity={1 - i / 18}
          />
        ))}
        <text x="150" y="72" fontSize="7" textAnchor="end" fill="#7dd3fc" fontFamily="ui-monospace, monospace" letterSpacing="2">LEXICON 480L</text>
      </svg>
    ),
  },
];

interface Props {
  onApplyToTrack: (apply: (h: GearApplyHandlers) => void) => void;
}

export default function GearRack({ onApplyToTrack }: Props) {
  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#1a1410] via-[#0e0a08] to-[#0c0c14] p-4">
      <header className="mb-3">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300/85">
          Studio rack
        </p>
        <p className="mt-0.5 text-xs text-white/55">
          Click a piece of gear to apply a preset to the focused track.
          Audio uses native Web Audio under the hood — these are honest
          tributes, not faked emulations.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyToTrack(preset.apply)}
            className="group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-center transition hover:border-white/25 hover:bg-black/60"
          >
            <div className="flex h-24 items-end justify-center">
              <preset.Glyph />
            </div>
            <div className="w-full">
              <p className="text-sm font-bold text-white/95 group-hover:text-white">{preset.name}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-widest text-white/40">{preset.subtitle}</p>
              <p className="mt-1 text-[9px] uppercase tracking-widest text-amber-300/55">{preset.era}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
