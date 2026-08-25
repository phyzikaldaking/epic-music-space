"use client";

import type { StudioTrack } from "../types";
import { EffectsBrowser } from "./EffectsBrowser";
import { MixAssistant } from "./MixAssistant";
import { trackStudio } from "../../../../lib/studioTelemetry";

export function MixerWorkspace({
  tracks,
  selected,
  update,
  arm,
}: {
  tracks: StudioTrack[];
  selected: StudioTrack | null;
  update: (id: string, patch: Partial<StudioTrack>, label?: string) => void;
  arm: (id: string) => void;
}) {
  return (
    <div className="platinum-mixer min-h-full overflow-auto" data-testid="studio-mixer">
      <div className="platinum-mixer__header sticky top-0 z-30"><div><span>PLATINUM CONSOLE · PRO MIX VIEW</span><h2>Mix Room</h2><small className="text-white/45">Timeline-connected channel strips · changes save to this session</small></div><p>{tracks.length} CHANNELS · MASTER OUT · 48-BIT MIX ENGINE</p></div>
      <div className="platinum-mixer__body min-w-max"><div className="platinum-mixer__channels items-stretch">
        {tracks.length === 0 && <div className="platinum-empty platinum-empty--room"><b>No channels yet</b><span>Import or record audio in Edit to build your mixer.</span><div className="platinum-master-preview"><b>MASTER</b><div className="platinum-channel__meter-wrap"><div className="platinum-channel__meter"><div className="platinum-channel__level" style={{ height: "8%" }} /></div></div><span>Master output is ready for incoming tracks.</span></div></div>}
        {tracks.map((track) => {
          const clipping = track.volume + track.inputGain >= 154;
          const active = selected?.id === track.id;

          return (
            <div
              key={track.id}
              className={active ? "platinum-channel is-active" : "platinum-channel"}
            >
              <div className="platinum-channel__head">
                <b className="truncate text-xs uppercase tracking-widest" style={{ color: track.color }}>
                  {track.name}
                </b>
                <button
                  onClick={() => arm(track.id)}
                  className={track.armed ? "is-armed" : ""}
                >
                  Arm
                </button>
              </div>

              <div className="platinum-channel__meter-wrap">
                <div className="platinum-channel__meter">
                  <div
                    className="platinum-channel__level"
                    style={{ height: `${Math.max(4, track.volume)}%` }}
                  />
                </div>
              </div>

              <label className="flex min-h-[150px] flex-1 flex-col items-center justify-end gap-2 text-[10px] uppercase tracking-widest text-white/45">
                <span>Fader <b className="text-cyan-100">{track.volume}</b></span>
                <input aria-label={`${track.name} volume fader`} type="range" min="0" max="100" value={track.volume} onChange={(event) => update(track.id, { volume: Number(event.target.value) }, "Mixer volume")} className="h-32 accent-cyan-300" style={{ writingMode: "vertical-lr", direction: "rtl" }} />
                <span className="font-mono text-[9px] text-white/30">-∞ · 0 · +6</span>
              </label>

              <label className="mt-2 block text-[10px] uppercase tracking-widest text-white/45">
                Pan {track.pan}
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={track.pan}
                  onChange={(event) => update(track.id, { pan: Number(event.target.value) }, "Mixer pan")}
                  className="w-full accent-purple-300"
                />
              </label>

              <label className="mt-2 block text-[10px] uppercase tracking-widest text-white/45">
                Input {track.inputGain}
                <input aria-label={`${track.name} input gain`} type="range" min="0" max="100" value={track.inputGain} onChange={(event) => update(track.id, { inputGain: Number(event.target.value) }, "Mixer input")} className="w-full accent-green-300" />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] uppercase text-white/35"><span className="rounded bg-black/40 px-1 py-1 text-center">Insert {track.inserts?.length ?? 0}</span><span className="rounded bg-black/40 px-1 py-1 text-center">Bus {track.outputBusId ?? "master"}</span></div>

              <div className="mt-3 grid grid-cols-2 gap-1 text-[9px] font-black uppercase">
                <button
                  onClick={() => update(track.id, { muted: !track.muted }, "Toggle mute")}
                  className={track.muted ? "bg-yellow-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
                >
                  Mute
                </button>
                <button
                  onClick={() => update(track.id, { solo: !track.solo }, "Toggle solo")}
                  className={track.solo ? "bg-cyan-300 py-1 text-black" : "bg-[#111] py-1 text-white/55"}
                >
                  Solo
                </button>
              </div>

              {clipping && (
                <div className="mt-3 bg-red-500 px-2 py-1 text-center text-[10px] font-black uppercase text-black">
                  Clipping
                </div>
              )}
            </div>
          );
        })}
      </div><div className="platinum-channel platinum-channel--master" aria-label="Master channel"><div className="platinum-channel__head"><b className="text-cyan-100">MASTER</b><span className="text-[9px] text-white/35">STEREO OUT</span></div><div className="platinum-channel__meter-wrap"><div className="platinum-channel__meter"><div className="platinum-channel__level" style={{ height: "18%" }} /></div></div><label className="flex min-h-[150px] flex-1 flex-col items-center justify-end gap-2 text-[10px] uppercase tracking-widest text-white/45"><span>Fader <b className="text-cyan-100">100</b></span><input aria-label="Master volume fader" type="range" min="0" max="100" defaultValue="100" className="h-32 accent-cyan-300" style={{ writingMode: "vertical-lr", direction: "rtl" }} /><span className="font-mono text-[9px] text-white/30">-∞ · 0 · +6</span></label><div className="mt-3 grid grid-cols-2 gap-1 text-[9px] font-black uppercase"><button className="bg-[#111] py-1 text-white/55">Mute</button><button className="bg-cyan-300 py-1 text-black">Safe</button></div></div><aside className="platinum-mixer__rack">
        {selected ? <>
          <div className="routing-panel"><div className="mix-panel__heading"><span>ROUTING</span><b>Cycle safe</b></div><label>Output<select value={selected.outputBusId ?? "master"} onChange={(event) => update(selected.id, { outputBusId:event.target.value }, "Route output")}><option value="master">Master</option><option value="music-bus">Music Bus</option><option value="vocal-bus">Vocal Bus</option></select></label><div className="insert-chain">{selected.inserts?.length ? selected.inserts.map((insert) => <button key={insert.id} onClick={() => update(selected.id, { inserts:selected.inserts?.map((item) => item.id === insert.id ? { ...item, bypassed:!item.bypassed } : item) }, "Bypass effect")} className={insert.bypassed ? "is-bypassed" : ""}>{insert.effectId.replaceAll("-", " ")} <small>{insert.bypassed ? "Bypassed" : "Active"}</small></button>) : <p>No inserts yet.</p>}</div></div>
          <EffectsBrowser onAdd={(effectId) => update(selected.id, { inserts:[...(selected.inserts ?? []), { id:`insert-${Date.now()}`, effectId, bypassed:false }] }, `Add ${effectId}`)} />
          <MixAssistant clipping={selected.volume + selected.inputGain >= 154} onApply={(volume) => update(selected.id, { volume }, "Apply reversible mix suggestion")} />
        </> : <p className="platinum-empty">Select a channel to open routing, effects, and assistance.</p>}
      </aside></div>
    </div>
  );
}
