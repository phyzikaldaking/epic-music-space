"use client";

import { useMemo, useState } from "react";

import ElectricStudioRoutingDaw from "./ElectricStudioRoutingDaw";

type Preset = "Vocal Up" | "Beat Loud" | "Radio Mix" | "Demo Mix" | "Master Prep";
type TrackType = "vocal" | "beat" | "music" | "drum" | "bass" | "fx";
type MixState = {
  vocalLevel: number;
  beatLevel: number;
  musicLevel: number;
  masterLevel: number;
  vocalPan: number;
  beatPan: number;
  musicPan: number;
  lowCut: number;
  mudCut: number;
  presence: number;
  compression: number;
  ceiling: number;
};
type AnalysisRow = {
  id: TrackType;
  label: string;
  confidence: number;
  recommendation: string;
};

const defaultMix: MixState = {
  vocalLevel: 78,
  beatLevel: 74,
  musicLevel: 72,
  masterLevel: 86,
  vocalPan: 0,
  beatPan: 0,
  musicPan: 0,
  lowCut: 70,
  mudCut: -2,
  presence: 2,
  compression: 3,
  ceiling: -1,
};

const presets: Record<Preset, MixState> = {
  "Vocal Up": {
    vocalLevel: 86,
    beatLevel: 70,
    musicLevel: 68,
    masterLevel: 84,
    vocalPan: 0,
    beatPan: 0,
    musicPan: -8,
    lowCut: 90,
    mudCut: -3,
    presence: 4,
    compression: 4,
    ceiling: -1.2,
  },
  "Beat Loud": {
    vocalLevel: 76,
    beatLevel: 86,
    musicLevel: 80,
    masterLevel: 86,
    vocalPan: 0,
    beatPan: 0,
    musicPan: 10,
    lowCut: 65,
    mudCut: -2,
    presence: 2,
    compression: 3,
    ceiling: -1,
  },
  "Radio Mix": {
    vocalLevel: 82,
    beatLevel: 78,
    musicLevel: 76,
    masterLevel: 88,
    vocalPan: 0,
    beatPan: 0,
    musicPan: 6,
    lowCut: 85,
    mudCut: -4,
    presence: 5,
    compression: 5,
    ceiling: -0.8,
  },
  "Demo Mix": {
    vocalLevel: 78,
    beatLevel: 74,
    musicLevel: 72,
    masterLevel: 82,
    vocalPan: 0,
    beatPan: 0,
    musicPan: 0,
    lowCut: 70,
    mudCut: -2,
    presence: 2,
    compression: 2,
    ceiling: -1.5,
  },
  "Master Prep": {
    vocalLevel: 76,
    beatLevel: 72,
    musicLevel: 70,
    masterLevel: 78,
    vocalPan: 0,
    beatPan: 0,
    musicPan: 0,
    lowCut: 80,
    mudCut: -3,
    presence: 2,
    compression: 2,
    ceiling: -6,
  },
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function panLabel(value: number) {
  if (value === 0) return "Center";
  return value < 0 ? `L${Math.abs(value)}` : `R${value}`;
}

function MixSlider({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="block rounded-xl border border-white/10 bg-black/35 p-3 text-[10px] font-black uppercase tracking-widest text-white/45">
      <span className="flex justify-between gap-3"><span>{label}</span><span className="font-mono text-cyan-100">{value}{suffix ?? ""}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-cyan-300" />
    </label>
  );
}

function compare(before: MixState, after: MixState) {
  return [
    ["Vocal level", before.vocalLevel, after.vocalLevel, ""],
    ["Beat level", before.beatLevel, after.beatLevel, ""],
    ["Music level", before.musicLevel, after.musicLevel, ""],
    ["Master level", before.masterLevel, after.masterLevel, ""],
    ["Vocal pan", before.vocalPan, after.vocalPan, ""],
    ["Beat pan", before.beatPan, after.beatPan, ""],
    ["Music pan", before.musicPan, after.musicPan, ""],
    ["Low cut", before.lowCut, after.lowCut, " Hz"],
    ["Mud cut", before.mudCut, after.mudCut, " dB"],
    ["Presence", before.presence, after.presence, " dB"],
    ["Compression", before.compression, after.compression, ":1"],
    ["Ceiling", before.ceiling, after.ceiling, " dB"],
  ] as const;
}

export default function ElectricStudioAiMixDaw() {
  const [mix, setMix] = useState<MixState>(defaultMix);
  const [beforeMix, setBeforeMix] = useState<MixState | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<Preset>("Demo Mix");
  const [lastAction, setLastAction] = useState("AI Mix is ready to analyze the main DAW/mixer.");

  const analysis = useMemo<AnalysisRow[]>(() => {
    const dominant = mix.beatLevel >= mix.vocalLevel ? "beat/music is leading" : "vocal is leading";
    return [
      { id: "vocal", label: "Vocal", confidence: 91, recommendation: `Keep lead vocal around ${mix.vocalLevel}. Suggested pan: ${panLabel(mix.vocalPan)}. Presence boost ${mix.presence} dB.` },
      { id: "beat", label: "Beat", confidence: 88, recommendation: `Beat is set to ${mix.beatLevel}. Current balance says ${dominant}. Keep kick/bass centered.` },
      { id: "music", label: "Music", confidence: 84, recommendation: `Music bed at ${mix.musicLevel}. Pan spread: ${panLabel(mix.musicPan)} for width without hiding the vocal.` },
      { id: "bass", label: "Low End", confidence: 80, recommendation: `Low cut at ${mix.lowCut} Hz. Avoid cutting bass bus; use this mostly on vocal and FX returns.` },
      { id: "drum", label: "Dynamics", confidence: 78, recommendation: `Compression ${mix.compression}:1. Use lighter compression for Master Prep, stronger for Radio Mix.` },
      { id: "fx", label: "FX/Space", confidence: 74, recommendation: `Mud cleanup ${mix.mudCut} dB and output ceiling ${mix.ceiling} dB to keep the mix clean.` },
    ];
  }, [mix]);

  function applyPreset(preset: Preset) {
    setBeforeMix(mix);
    setMix(presets[preset]);
    setSelectedPreset(preset);
    setLastAction(`Applied ${preset}: AI Mix updated levels, pan, EQ cleanup, compression, and master ceiling.`);
  }

  function restorePrevious() {
    if (!beforeMix) return;
    setMix(beforeMix);
    setBeforeMix(null);
    setLastAction("Restored previous mix settings.");
  }

  function smartAnalyze() {
    setBeforeMix(mix);
    const next: MixState = {
      ...mix,
      vocalLevel: Math.max(78, Math.min(86, mix.vocalLevel + 3)),
      beatLevel: Math.max(70, Math.min(82, mix.beatLevel - 1)),
      musicLevel: Math.max(68, Math.min(80, mix.musicLevel - 1)),
      vocalPan: 0,
      beatPan: 0,
      musicPan: mix.musicPan === 0 ? 8 : mix.musicPan,
      lowCut: Math.max(75, mix.lowCut),
      mudCut: Math.min(-2, mix.mudCut - 1),
      presence: Math.max(2, Math.min(5, mix.presence + 1)),
      compression: Math.max(2, Math.min(5, mix.compression + 1)),
      ceiling: Math.min(-1, mix.ceiling),
    };
    setMix(next);
    setLastAction("AI analyzed the session and created a balanced vocal-forward mix recommendation.");
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#05070a] text-white">
      <ElectricStudioRoutingDaw />

      <aside className="pointer-events-auto absolute bottom-20 left-3 top-16 z-[75] hidden w-[390px] overflow-hidden rounded-[1.35rem] border border-pink-300/20 bg-[#11151b]/96 shadow-[0_28px_90px_rgba(0,0,0,.72),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl 2xl:block">
        <header className="border-b border-black bg-[linear-gradient(180deg,rgba(255,122,223,.22),#171b21)] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-pink-100/75">Main DAW / Mixer</p>
          <h2 className="mt-1 font-display text-xl font-black uppercase tracking-[0.14em] text-white">AI Mix</h2>
          <p className="mt-2 text-xs leading-5 text-white/55">{lastAction}</p>
        </header>

        <div className="max-h-[calc(100%-8rem)] overflow-auto p-4">
          <section className="rounded-2xl border border-white/10 bg-black/35 p-4">
            <div className="flex items-center gap-2">
              <button onClick={smartAnalyze} className="min-h-11 flex-1 rounded-xl bg-pink-300 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black shadow-[0_0_24px_rgba(255,122,223,.22)]">Analyze Mix</button>
              <button onClick={restorePrevious} disabled={!beforeMix} className="min-h-11 rounded-xl bg-[#222832] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white/65 disabled:opacity-35">Undo</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(presets) as Preset[]).map((preset) => (
                <button key={preset} onClick={() => applyPreset(preset)} className={cn("rounded-xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest", selectedPreset === preset ? "border-pink-200 bg-pink-300 text-black" : "border-white/10 bg-[#11161d] text-white/55 hover:text-white")}>{preset}</button>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-cyan-100">Track Type Analysis</h3>
            <div className="mt-3 grid gap-2">
              {analysis.map((row) => (
                <article key={row.id} className="rounded-xl border border-white/10 bg-[#11161d] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <b className="text-[10px] uppercase tracking-widest text-white">{row.label}</b>
                    <span className="rounded-full bg-cyan-300/15 px-2 py-1 font-mono text-[9px] text-cyan-100">{row.confidence}%</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/55">{row.recommendation}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-4 grid gap-2">
            <MixSlider label="Vocal Level" value={mix.vocalLevel} min={0} max={100} onChange={(v) => setMix({ ...mix, vocalLevel: v })} />
            <MixSlider label="Beat Level" value={mix.beatLevel} min={0} max={100} onChange={(v) => setMix({ ...mix, beatLevel: v })} />
            <MixSlider label="Music Level" value={mix.musicLevel} min={0} max={100} onChange={(v) => setMix({ ...mix, musicLevel: v })} />
            <MixSlider label="Master Level" value={mix.masterLevel} min={0} max={100} onChange={(v) => setMix({ ...mix, masterLevel: v })} />
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-yellow-100">Pan / EQ / Compression</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MixSlider label="Vocal Pan" value={mix.vocalPan} min={-50} max={50} onChange={(v) => setMix({ ...mix, vocalPan: v })} />
              <MixSlider label="Music Pan" value={mix.musicPan} min={-50} max={50} onChange={(v) => setMix({ ...mix, musicPan: v })} />
              <MixSlider label="Low Cut" value={mix.lowCut} min={20} max={160} suffix="Hz" onChange={(v) => setMix({ ...mix, lowCut: v })} />
              <MixSlider label="Mud Cut" value={mix.mudCut} min={-12} max={0} suffix="dB" onChange={(v) => setMix({ ...mix, mudCut: v })} />
              <MixSlider label="Presence" value={mix.presence} min={-6} max={8} suffix="dB" onChange={(v) => setMix({ ...mix, presence: v })} />
              <MixSlider label="Compression" value={mix.compression} min={1} max={12} suffix=":1" onChange={(v) => setMix({ ...mix, compression: v })} />
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-green-100">Before / After</h3>
            <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-white/10">
              {compare(beforeMix ?? defaultMix, mix).map(([label, before, after, suffix]) => (
                <div key={label} className="grid grid-cols-[1fr_70px_70px] border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-white/50">
                  <span>{label}</span>
                  <span className="font-mono">{before}{suffix}</span>
                  <span className={before === after ? "font-mono text-white/45" : "font-mono text-green-200"}>{after}{suffix}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>

      <div className="absolute bottom-[4.7rem] left-3 right-3 z-[76] rounded-2xl border border-pink-300/20 bg-black/82 p-3 text-[10px] font-black uppercase tracking-widest text-white/60 shadow-[0_12px_40px_rgba(0,0,0,.45)] backdrop-blur 2xl:hidden">
        AI Mix is active in the main DAW/mixer. Use a wider desktop view to access the full AI Mix rack with analysis, presets, before/after, and undo.
      </div>
    </div>
  );
}
