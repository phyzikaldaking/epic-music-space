"use client";

import { useState } from "react";
import type { TrackFx, TrackId } from "./dawEngine";

interface SidechainOption { id: TrackId; name: string; color: string }
interface Props {
  fx: TrackFx;
  eqSpectrum: number[];
  compGainReductionDb: number;
  sidechainFromId: TrackId | null;
  sidechainAmount: number;
  sidechainOptions: SidechainOption[];
  trackHpfHz?: number;
  sidechainLookaheadMs?: number;
  sendsPreFader?: boolean;
  onSetEq: (band: "low" | "mid" | "high", db: number) => void;
  onSetComp: (params: { threshDb?: number; ratio?: number; enabled?: boolean; parallelBlend?: number }) => void;
  onSetVocalBus: (params: { enabled?: boolean; driveDb?: number; presenceDb?: number; airDb?: number; crush?: number; deEssDb?: number }) => void;
  onSetReverb: (params: { wet?: number; decaySec?: number }) => void;
  onSetDelay: (params: { wet?: number; beats?: number; feedback?: number }) => void;
  onSetSidechain: (sourceId: TrackId | null, amount?: number) => void;
  onSetTrackHpf?: (hz: number) => void;
  onSetSidechainLookahead?: (ms: number) => void;
  onSetSendPosition?: (position: "pre" | "post") => void;
}

export default function FxPanel(props: Props) {
  const { fx, eqSpectrum, compGainReductionDb, sidechainFromId, sidechainAmount, sidechainOptions, trackHpfHz, sidechainLookaheadMs, sendsPreFader, onSetEq, onSetComp, onSetVocalBus, onSetReverb, onSetDelay, onSetSidechain, onSetTrackHpf, onSetSidechainLookahead, onSetSendPosition } = props;
  const [open, setOpen] = useState(false);
  const engageComp = (params: { threshDb?: number; ratio?: number; parallelBlend?: number }) => onSetComp({ enabled: true, ...params });
  const engageVocal = (params: { driveDb?: number; presenceDb?: number; airDb?: number; crush?: number; deEssDb?: number }) => onSetVocalBus({ enabled: true, ...params });

  return (
    <div className="border-t border-white/5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full touch-manipulation items-center justify-between gap-2 px-1 py-2 text-[10px] font-bold uppercase tracking-widest text-white/45 transition hover:text-white/70">
        <span>{open ? "▾" : "▸"} Inserts + sends</span><span className="font-mono text-white/30">{fxSummary(fx)}</span>
      </button>
      {open && <div className="grid gap-3 pb-3 sm:grid-cols-2">
        <FxBlock title="EQ" subtitle="3-band"><SpectrumOverlay values={eqSpectrum} /><Slider label="Low" min={-12} max={12} step={0.5} value={fx.eqLowDb} suffix="dB" onChange={(v) => onSetEq("low", v)} accent="brand" /><Slider label="Mid" min={-12} max={12} step={0.5} value={fx.eqMidDb} suffix="dB" onChange={(v) => onSetEq("mid", v)} accent="brand" /><Slider label="High" min={-12} max={12} step={0.5} value={fx.eqHighDb} suffix="dB" onChange={(v) => onSetEq("high", v)} accent="brand" /></FxBlock>
        <FxBlock title="Compressor" subtitle={fx.compEnabled ? "engaged" : "bypassed"} disabledHint={!fx.compEnabled ? "Move any compressor control or press On to engage it." : undefined}>
          <button type="button" onClick={() => onSetComp({ enabled: !fx.compEnabled })} className={`mb-2 touch-manipulation rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-widest transition ${fx.compEnabled ? "bg-accent-500 text-black" : "border border-white/15 text-white/55 hover:bg-white/10"}`}>{fx.compEnabled ? "On" : "Off"}</button>
          <GainReductionMeter reductionDb={compGainReductionDb} />
          <Slider label="Threshold" min={-60} max={0} step={0.5} value={fx.compThreshDb} suffix="dB" onChange={(v) => engageComp({ threshDb: v })} />
          <Slider label="Ratio" min={1} max={20} step={0.5} value={fx.compRatio} suffix=":1" onChange={(v) => engageComp({ ratio: v })} />
          <Slider label="Parallel" min={0} max={1} step={0.01} value={fx.compParallelBlend ?? 0} suffix="" onChange={(v) => engageComp({ parallelBlend: v })} />
        </FxBlock>
        <FxBlock title="Vocal bus" subtitle={fx.vocalBusEnabled ? "frontline" : "bypassed"} disabledHint={!fx.vocalBusEnabled ? "Move any vocal-bus control or press On to engage it." : undefined}>
          <button type="button" onClick={() => onSetVocalBus({ enabled: !fx.vocalBusEnabled })} className={`mb-2 touch-manipulation rounded-md px-3 py-1 text-[10px] font-black uppercase tracking-widest transition ${fx.vocalBusEnabled ? "bg-amber-300 text-black" : "border border-white/15 text-white/55 hover:bg-white/10"}`}>{fx.vocalBusEnabled ? "On" : "Off"}</button>
          <Slider label="Drive" min={0} max={18} step={0.5} value={fx.vocalBusDriveDb} suffix="dB" onChange={(v) => engageVocal({ driveDb: v })} accent="amber" />
          <Slider label="Presence" min={-6} max={6} step={0.5} value={fx.vocalBusPresenceDb} suffix="dB" onChange={(v) => engageVocal({ presenceDb: v })} accent="amber" />
          <Slider label="Air" min={-6} max={8} step={0.5} value={fx.vocalBusAirDb} suffix="dB" onChange={(v) => engageVocal({ airDb: v })} accent="amber" />
          <Slider label="Crush" min={0} max={1} step={0.01} value={fx.vocalBusCrush} suffix="" onChange={(v) => engageVocal({ crush: v })} accent="amber" />
          <Slider label="De-ess" min={-12} max={0} step={0.5} value={fx.vocalBusDeEssDb ?? 0} suffix="dB" onChange={(v) => engageVocal({ deEssDb: v })} accent="amber" />
        </FxBlock>
        {onSetTrackHpf && <FxBlock title="Track HPF" subtitle={`${(trackHpfHz ?? 30).toFixed(0)} Hz`}><div className="flex flex-wrap items-center gap-1">{[20, 30, 60, 80, 120].map((hz) => { const active = Math.abs((trackHpfHz ?? 30) - hz) < 1; return <button key={hz} type="button" onClick={() => onSetTrackHpf(hz)} className={`touch-manipulation rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${active ? "bg-amber-400/30 text-amber-100" : "border border-white/15 text-white/60 hover:bg-white/10"}`}>{hz === 20 ? "Off" : hz}</button>; })}</div><Slider label="Corner" min={20} max={300} step={1} value={trackHpfHz ?? 30} suffix=" Hz" onChange={(v) => onSetTrackHpf(v)} accent="brand" /></FxBlock>}
        <FxBlock title="Reverb send" subtitle={sendsPreFader ? "pre · shared aux" : "post · shared aux"}>{onSetSendPosition && <button type="button" onClick={() => onSetSendPosition(sendsPreFader ? "post" : "pre")} className={`mb-2 touch-manipulation rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest transition ${sendsPreFader ? "bg-cyan-400/30 text-cyan-100" : "border border-white/15 text-white/55 hover:bg-white/10"}`}>{sendsPreFader ? "Pre" : "Post"}</button>}<Slider label="Send" min={0} max={1} step={0.01} value={fx.reverbWet} suffix="" onChange={(v) => onSetReverb({ wet: v })} accent="violet" /><Slider label="Decay" min={0.2} max={6} step={0.1} value={fx.reverbDecaySec} suffix="s" onChange={(v) => onSetReverb({ decaySec: v })} accent="violet" /></FxBlock>
        <FxBlock title="Sidechain" subtitle={sidechainFromId ? "ducking" : "off"}><select aria-label="Choose sidechain source" value={sidechainFromId ?? ""} onChange={(e) => onSetSidechain(e.target.value || null)} className="mb-2 touch-manipulation rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[10px] font-bold text-white"><option value="">Off</option>{sidechainOptions.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}</select><Slider label="Amount" min={0} max={1} step={0.01} value={sidechainAmount} suffix="" onChange={(v) => onSetSidechain(sidechainFromId, v)} accent="cyan" />{onSetSidechainLookahead && <Slider label="Lookahead" min={0} max={15} step={0.5} value={sidechainLookaheadMs ?? 0} suffix=" ms" onChange={(v) => onSetSidechainLookahead(v)} accent="cyan" />}</FxBlock>
        <FxBlock title="Delay send" subtitle={sendsPreFader ? "pre · shared aux" : "post · shared aux"}>{onSetSendPosition && <button type="button" onClick={() => onSetSendPosition(sendsPreFader ? "post" : "pre")} className={`mb-2 touch-manipulation rounded px-2 py-1 text-[9px] font-black uppercase tracking-widest transition ${sendsPreFader ? "bg-cyan-400/30 text-cyan-100" : "border border-white/15 text-white/55 hover:bg-white/10"}`}>{sendsPreFader ? "Pre" : "Post"}</button>}<Slider label="Send" min={0} max={1} step={0.01} value={fx.delayWet} suffix="" onChange={(v) => onSetDelay({ wet: v })} accent="cyan" /><Slider label="Beats" min={0.0625} max={2} step={0.0625} value={fx.delayBeats} suffix=" b" onChange={(v) => onSetDelay({ beats: v })} accent="cyan" /><Slider label="Feedback" min={0} max={0.85} step={0.01} value={fx.delayFeedback} suffix="" onChange={(v) => onSetDelay({ feedback: v })} accent="cyan" /></FxBlock>
      </div>}
    </div>
  );
}

function SpectrumOverlay({ values }: { values: number[] }) { const bars = (values.length > 0 ? values : Array.from({ length: 24 }, () => 0)).slice(0, 24); return <div className="pointer-events-none mb-2 h-14 rounded-md border border-cyan-200/15 bg-gradient-to-b from-cyan-300/10 to-transparent p-1"><div className="flex h-full items-end gap-[2px]">{bars.map((v, idx) => <div key={`${idx}_${v.toFixed(3)}`} className="flex-1 rounded-sm bg-cyan-200/70" style={{ height: `${Math.max(6, Math.min(100, v * 100))}%` }} />)}</div></div>; }
function GainReductionMeter({ reductionDb }: { reductionDb: number }) { const amount = Math.max(0, Math.min(24, -reductionDb)); return <div className="pointer-events-none mb-2 rounded-md border border-white/10 bg-black/30 p-1.5"><div className="mb-1 flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-white/55"><span>GR</span><span className="font-mono text-white/70">{(-amount).toFixed(1)} dB</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-emerald-300 to-amber-300 transition-[width] duration-100" style={{ width: `${(amount / 24) * 100}%` }} /></div></div>; }
function FxBlock({ title, subtitle, disabledHint, children }: { title: string; subtitle?: string; disabledHint?: string; children: React.ReactNode }) { return <div className="rounded-lg border border-white/10 bg-black/30 p-2.5"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-widest text-white/75">{title} <span className="font-normal text-white/35">· {subtitle}</span></p></div><div className={disabledHint ? "space-y-1.5 opacity-85" : "space-y-1.5"}>{children}</div>{disabledHint && <p className="mt-2 text-[10px] italic text-amber-200/80">↑ {disabledHint}</p>}</div>; }
function Slider({ label, min, max, step, value, suffix, onChange, accent = "white" }: { label: string; min: number; max: number; step: number; value: number; suffix: string; onChange: (v: number) => void; accent?: "white" | "brand" | "cyan" | "violet" | "amber" }) { const accentClass = accent === "brand" ? "accent-brand-500" : accent === "cyan" ? "accent-accent-500" : accent === "violet" ? "accent-violet-500" : accent === "amber" ? "accent-amber-300" : "accent-white"; return <label className="flex touch-manipulation select-none items-center gap-2 text-[10px] uppercase tracking-wider text-white/55"><span className="w-16 shrink-0">{label}</span><input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(Number(e.currentTarget.value))} onChange={(e) => onChange(Number(e.currentTarget.value))} className={`min-h-7 flex-1 cursor-pointer ${accentClass}`} /><span className="w-12 text-right font-mono tabular-nums text-white/65">{value.toFixed(suffix === ":1" ? 1 : suffix === " b" ? 3 : 2)}{suffix}</span></label>; }
function fxSummary(fx: TrackFx): string { const parts: string[] = []; if (fx.eqLowDb || fx.eqMidDb || fx.eqHighDb) parts.push("EQ"); if (fx.compEnabled) parts.push("Comp"); if (fx.vocalBusEnabled) parts.push("Frontline bus"); if (fx.reverbWet > 0.01) parts.push("Verb send"); if (fx.delayWet > 0.01) parts.push("Dly send"); return parts.length > 0 ? parts.join(" · ") : "flat"; }
