"use client";

import { useState } from "react";
import type { TrackFx, TrackId } from "./dawEngine";

interface SidechainOption {
  id: TrackId;
  name: string;
  color: string;
}

interface Props {
  fx: TrackFx;
  /** Current sidechain source track id (or null for off). */
  sidechainFromId: TrackId | null;
  /** Sidechain depth 0..1. */
  sidechainAmount: number;
  /** Tracks selectable as sidechain sources (excludes self in caller). */
  sidechainOptions: SidechainOption[];
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
  onSetSidechain: (sourceId: TrackId | null, amount?: number) => void;
}

export default function FxPanel({
  fx,
  sidechainFromId,
  sidechainAmount,
  sidechainOptions,
  onSetEq,
  onSetComp,
  onSetVocalBus,
  onSetReverb,
  onSetDelay,
  onSetSidechain,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-white/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-1 py-2 text-[10px] font-bold uppercase tracking-widest text-white/45 hover:text-white/70 transition"
      >
        <span>{open ? "▾" : "▸"} Inserts + sends</span>
        <span className="font-mono text-white/30">
          {fxSummary(fx)}
        </span>
      </button>

      {open && (
        <div className="grid gap-3 pb-3 sm:grid-cols-2">
          <FxBlock title="EQ" subtitle="3-band">
            <Slider
              label="Low"
              min={-12}
              max={12}
              step={0.5}
              value={fx.eqLowDb}
              suffix="dB"
              onChange={(v) => onSetEq("low", v)}
              accent="brand"
            />
            <Slider
              label="Mid"
              min={-12}
              max={12}
              step={0.5}
              value={fx.eqMidDb}
              suffix="dB"
              onChange={(v) => onSetEq("mid", v)}
              accent="brand"
            />
            <Slider
              label="High"
              min={-12}
              max={12}
              step={0.5}
              value={fx.eqHighDb}
              suffix="dB"
              onChange={(v) => onSetEq("high", v)}
              accent="brand"
            />
          </FxBlock>

          <FxBlock
            title="Compressor"
            subtitle={fx.compEnabled ? "engaged" : "bypassed"}
            toggle={
              <button
                type="button"
                onClick={() => onSetComp({ enabled: !fx.compEnabled })}
                className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition ${
                  fx.compEnabled
                    ? "bg-accent-500 text-black"
                    : "border border-white/15 text-white/55 hover:bg-white/10"
                }`}
              >
                {fx.compEnabled ? "On" : "Off"}
              </button>
            }
          >
            <Slider
              label="Threshold"
              min={-60}
              max={0}
              step={0.5}
              value={fx.compThreshDb}
              suffix="dB"
              onChange={(v) => onSetComp({ threshDb: v })}
            />
            <Slider
              label="Ratio"
              min={1}
              max={20}
              step={0.5}
              value={fx.compRatio}
              suffix=":1"
              onChange={(v) => onSetComp({ ratio: v })}
            />
          </FxBlock>

          <FxBlock
            title="Vocal bus"
            subtitle={fx.vocalBusEnabled ? "frontline" : "bypassed"}
            toggle={
              <button
                type="button"
                onClick={() => onSetVocalBus({ enabled: !fx.vocalBusEnabled })}
                className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest transition ${
                  fx.vocalBusEnabled
                    ? "bg-amber-300 text-black"
                    : "border border-white/15 text-white/55 hover:bg-white/10"
                }`}
              >
                {fx.vocalBusEnabled ? "On" : "Off"}
              </button>
            }
          >
            <Slider
              label="Drive"
              min={0}
              max={18}
              step={0.5}
              value={fx.vocalBusDriveDb}
              suffix="dB"
              onChange={(v) => onSetVocalBus({ driveDb: v })}
              accent="amber"
            />
            <Slider
              label="Presence"
              min={-6}
              max={6}
              step={0.5}
              value={fx.vocalBusPresenceDb}
              suffix="dB"
              onChange={(v) => onSetVocalBus({ presenceDb: v })}
              accent="amber"
            />
            <Slider
              label="Air"
              min={-6}
              max={8}
              step={0.5}
              value={fx.vocalBusAirDb}
              suffix="dB"
              onChange={(v) => onSetVocalBus({ airDb: v })}
              accent="amber"
            />
            <Slider
              label="Crush"
              min={0}
              max={1}
              step={0.01}
              value={fx.vocalBusCrush}
              suffix=""
              onChange={(v) => onSetVocalBus({ crush: v })}
              accent="amber"
            />
          </FxBlock>

          <FxBlock title="Reverb send" subtitle="shared aux">
            <Slider
              label="Send"
              min={0}
              max={1}
              step={0.01}
              value={fx.reverbWet}
              suffix=""
              onChange={(v) => onSetReverb({ wet: v })}
              accent="violet"
            />
            <Slider
              label="Decay"
              min={0.2}
              max={6}
              step={0.1}
              value={fx.reverbDecaySec}
              suffix="s"
              onChange={(v) => onSetReverb({ decaySec: v })}
              accent="violet"
            />
          </FxBlock>

          <FxBlock
            title="Sidechain"
            subtitle={sidechainFromId ? "ducking" : "off"}
            toggle={
              <select
                aria-label="Choose sidechain source"
                title="Choose sidechain source"
                value={sidechainFromId ?? ""}
                onChange={(e) => onSetSidechain(e.target.value || null)}
                className="rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-white"
              >
                <option value="">Off</option>
                {sidechainOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            }
          >
            <Slider
              label="Amount"
              min={0}
              max={1}
              step={0.01}
              value={sidechainAmount}
              suffix=""
              onChange={(v) => onSetSidechain(sidechainFromId, v)}
              accent="cyan"
            />
          </FxBlock>

          <FxBlock title="Delay send" subtitle="shared aux">
            <Slider
              label="Send"
              min={0}
              max={1}
              step={0.01}
              value={fx.delayWet}
              suffix=""
              onChange={(v) => onSetDelay({ wet: v })}
              accent="cyan"
            />
            <Slider
              label="Beats"
              min={0.0625}
              max={2}
              step={0.0625}
              value={fx.delayBeats}
              suffix=" b"
              onChange={(v) => onSetDelay({ beats: v })}
              accent="cyan"
            />
            <Slider
              label="Feedback"
              min={0}
              max={0.85}
              step={0.01}
              value={fx.delayFeedback}
              suffix=""
              onChange={(v) => onSetDelay({ feedback: v })}
              accent="cyan"
            />
          </FxBlock>
        </div>
      )}
    </div>
  );
}

function FxBlock({
  title,
  subtitle,
  toggle,
  children,
}: {
  title: string;
  subtitle?: string;
  toggle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/75">
          {title} <span className="font-normal text-white/35">· {subtitle}</span>
        </p>
        {toggle}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix,
  onChange,
  accent = "white",
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix: string;
  onChange: (v: number) => void;
  accent?: "white" | "brand" | "cyan" | "violet" | "amber";
}) {
  const accentClass =
    accent === "brand" ? "accent-brand-500" :
    accent === "cyan" ? "accent-accent-500" :
    accent === "violet" ? "accent-violet-500" :
    accent === "amber" ? "accent-amber-300" :
    "accent-white";
  return (
    <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/55">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`flex-1 ${accentClass}`}
      />
      <span className="w-12 text-right font-mono tabular-nums text-white/65">
        {value.toFixed(suffix === ":1" ? 1 : suffix === " b" ? 3 : 2)}
        {suffix}
      </span>
    </label>
  );
}

function fxSummary(fx: TrackFx): string {
  const parts: string[] = [];
  if (fx.eqLowDb || fx.eqMidDb || fx.eqHighDb) parts.push("EQ");
  if (fx.compEnabled) parts.push("Comp");
  if (fx.vocalBusEnabled) parts.push("Frontline bus");
  if (fx.reverbWet > 0.01) parts.push("Verb send");
  if (fx.delayWet > 0.01) parts.push("Dly send");
  return parts.length > 0 ? parts.join(" · ") : "flat";
}
