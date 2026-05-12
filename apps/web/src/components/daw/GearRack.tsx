"use client";

/**
 * Compact gear rack for the EMS DAW.
 *
 * The rack is intentionally rendered like Pro Tools insert/plugin slots:
 * small, dense, track-ready buttons instead of oversized hardware cards.
 * Clicking a slot still applies the same Web Audio preset chain to the
 * focused track; this is a presentation/layout correction, not a DSP change.
 */

interface GearPreset {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  tone: string;
  apply: (fns: GearApplyHandlers) => void;
}

export interface GearApplyHandlers {
  onArm: () => void;
  onSetEq: (band: "low" | "mid" | "high", db: number) => void;
  onSetComp: (params: { threshDb?: number; ratio?: number; enabled?: boolean }) => void;
  onSetVocalBus: (params: {
    enabled?: boolean;
    driveDb?: number;
    presenceDb?: number;
    airDb?: number;
    crush?: number;
  }) => void;
  onSetReverb: (params: { wet?: number; decaySec?: number }) => void;
  onSetDelay: (params: { wet?: number; beats?: number; feedback?: number }) => void;
}

const PRESETS: GearPreset[] = [
  {
    id: "u87",
    name: "U87",
    shortName: "U87",
    subtitle: "Mic arm",
    tone: "border-slate-300/35 bg-slate-300/10 text-slate-100",
    apply: ({ onArm }) => onArm(),
  },
  {
    id: "avalon",
    name: "Avalon 737",
    shortName: "737",
    subtitle: "Vocal chain",
    tone: "border-amber-300/35 bg-amber-400/10 text-amber-100",
    apply: ({ onSetEq, onSetComp, onSetReverb }) => {
      onSetEq("low", -2);
      onSetEq("mid", 1.5);
      onSetEq("high", 2);
      onSetComp({ enabled: true, threshDb: -22, ratio: 4 });
      onSetReverb({ wet: 0.18, decaySec: 1.6 });
    },
  },
  {
    id: "frontline",
    name: "EMS Frontline",
    shortName: "EMS",
    subtitle: "Lead bus",
    tone: "border-cyan-300/35 bg-cyan-400/10 text-cyan-100",
    apply: ({ onSetEq, onSetComp, onSetVocalBus, onSetReverb, onSetDelay }) => {
      onSetEq("low", -3);
      onSetEq("mid", 2);
      onSetEq("high", 3);
      onSetComp({ enabled: true, threshDb: -26, ratio: 5 });
      onSetVocalBus({
        enabled: true,
        driveDb: 6,
        presenceDb: 3.5,
        airDb: 4,
        crush: 0.35,
      });
      onSetReverb({ wet: 0.12, decaySec: 1.2 });
      onSetDelay({ wet: 0.07, beats: 0.25, feedback: 0.18 });
    },
  },
  {
    id: "pultec",
    name: "Pultec EQP-1A",
    shortName: "EQP",
    subtitle: "Low + air",
    tone: "border-orange-300/35 bg-orange-400/10 text-orange-100",
    apply: ({ onSetEq, onSetComp }) => {
      onSetEq("low", 3);
      onSetEq("mid", 0);
      onSetEq("high", 3);
      onSetComp({ enabled: false });
    },
  },
  {
    id: "lexicon",
    name: "Lexicon 480L",
    shortName: "480L",
    subtitle: "Hall send",
    tone: "border-blue-300/35 bg-blue-400/10 text-blue-100",
    apply: ({ onSetReverb }) => {
      onSetReverb({ wet: 0.35, decaySec: 4 });
    },
  },
];

interface Props {
  onApplyToTrack: (apply: (h: GearApplyHandlers) => void) => void;
}

export default function GearRack({ onApplyToTrack }: Props) {
  return (
    <section className="rounded-lg border border-white/10 bg-black/25 p-2">
      <header className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/55">
            Inserts
          </p>
          <p className="text-[10px] text-white/35">
            Compact preset slots for the focused mixer track.
          </p>
        </div>
        <span className="rounded border border-emerald-300/25 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-100">
          Track FX
        </span>
      </header>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyToTrack(preset.apply)}
            title={`${preset.name} - apply to focused track`}
            className={`group min-h-12 rounded-md border px-2 py-1.5 text-left shadow-inner transition hover:-translate-y-0.5 hover:bg-white/10 ${preset.tone}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/80">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="truncate text-[11px] font-black uppercase tracking-widest">
                {preset.shortName}
              </span>
            </div>
            <p className="mt-1 truncate text-[9px] uppercase tracking-wider text-white/45">
              {preset.subtitle}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
