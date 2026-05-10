"use client";

import type { EngineSnapshot, TrackId, TrackState } from "./dawEngine";

type ProMixWindowProps = {
  snapshot: EngineSnapshot;
  focusedId: TrackId | null;
  onFocusTrack: (trackId: TrackId) => void;
  onSetTrackGain: (trackId: TrackId, gainDb: number) => void;
  onSetTrackPan: (trackId: TrackId, pan: number) => void;
  onToggleMute: (trackId: TrackId) => void;
  onToggleSolo: (trackId: TrackId) => void;
  onToggleArm: (trackId: TrackId) => void;
  onSetMasterGain: (gainDb: number) => void;
};

const MIX_SCENES = [
  { name: "Radio", detail: "Clean vocal lift, safe peaks" },
  { name: "Club", detail: "Hard low end, loud master" },
  { name: "Clean", detail: "Broadcast-safe alternate" },
  { name: "Performance", detail: "Lead vocal + track outs" },
  { name: "Battle", detail: "Punchy first 30 seconds" },
  { name: "Streaming", detail: "-14 LUFS target" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percent(value: number, min: number, max: number): number {
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

function formatDb(value: number): string {
  if (value <= -59) return "-inf";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function mixDoctor(snapshot: EngineSnapshot): string[] {
  const tips: string[] = [];
  const { transport, tracks } = snapshot;
  const loudness = Number.isFinite(transport.masterLufs) ? transport.masterLufs : -Infinity;

  if (transport.masterTruePeak > 0.96) tips.push("Master is near clipping. Pull master trim or enable limiter before export.");
  if (loudness < -18) tips.push("Mix is quiet for streaming. Push master or mix bus after gain staging.");
  if (loudness > -10) tips.push("Mix is very loud. Check transients and true peak before publishing.");
  if (transport.masterPhaseCorrelation < 0.2) tips.push("Stereo phase is risky. Check mono compatibility before release.");

  const vocal = tracks.find((track) => /vocal|vox|lead/i.test(track.name));
  if (vocal && vocal.level < 0.08 && tracks.some((track) => track.level > 0.2)) {
    tips.push("Vocal is reading low against the track. Bring it forward or reduce beat bus level.");
  }

  const armed = tracks.filter((track) => track.armed).length;
  if (armed > 1) tips.push("Multiple tracks are armed. Confirm inputs before recording a new take.");
  if (!tips.length) tips.push("Mix is balanced enough to start A/B reference checks and save a scene.");
  return tips.slice(0, 4);
}

function ChannelStrip(props: {
  track: TrackState;
  selected: boolean;
  onFocus: () => void;
  onSetGain: (gainDb: number) => void;
  onSetPan: (pan: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleArm: () => void;
}) {
  const { track, selected } = props;
  const levelPct = percent(Math.sqrt(track.level), 0, 1);
  const faderPct = percent(track.gainDb, -60, 6);
  const panPct = percent(track.pan, -1, 1);

  return (
    <section
      className={`min-w-[184px] rounded-3xl border bg-black/50 p-4 shadow-2xl shadow-black/30 ${
        selected ? "border-cyan-300/70 ring-2 ring-cyan-300/20" : "border-white/10"
      }`}
      onClick={props.onFocus}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Channel</p>
          <h3 className="mt-1 max-w-[118px] truncate text-sm font-black text-white">{track.name}</h3>
        </div>
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: track.color }} />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-white/40">
          <span>Meter</span>
          <span>{Math.round(levelPct)}%</span>
        </div>
        <div className="mt-2 h-28 overflow-hidden rounded-full bg-white/10 p-1">
          <div className="flex h-full items-end rounded-full bg-black/50">
            <div
              className={`w-full rounded-full ${track.level > 0.85 ? "bg-red-400" : track.level > 0.62 ? "bg-yellow-300" : "bg-emerald-300"}`}
              style={{ height: `${levelPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.25em] text-white/40">
            <span>Fader</span>
            <span>{formatDb(track.gainDb)}</span>
          </div>
          <input
            aria-label={`${track.name} fader`}
            className="w-full accent-cyan-300"
            type="range"
            min={-60}
            max={6}
            step={0.5}
            value={track.gainDb}
            onChange={(event) => props.onSetGain(Number(event.currentTarget.value))}
          />
          <div className="mt-1 h-1.5 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${faderPct}%` }} />
          </div>
        </label>

        <label className="block">
          <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.25em] text-white/40">
            <span>Pan</span>
            <span>{track.pan === 0 ? "C" : track.pan < 0 ? `${Math.round(Math.abs(track.pan) * 100)}L` : `${Math.round(track.pan * 100)}R`}</span>
          </div>
          <input
            aria-label={`${track.name} pan`}
            className="w-full accent-fuchsia-300"
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={track.pan}
            onChange={(event) => props.onSetPan(Number(event.currentTarget.value))}
          />
          <div className="mt-1 h-1.5 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-fuchsia-300" style={{ marginLeft: `${Math.min(panPct, 50)}%`, width: `${Math.abs(panPct - 50)}%` }} />
          </div>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
        <button type="button" onClick={props.onToggleMute} className={`rounded-xl border px-2 py-2 ${track.muted ? "border-red-300 bg-red-400/20 text-red-100" : "border-white/10 bg-white/[0.03] text-white/60"}`}>M</button>
        <button type="button" onClick={props.onToggleSolo} className={`rounded-xl border px-2 py-2 ${track.solo ? "border-yellow-300 bg-yellow-300/20 text-yellow-100" : "border-white/10 bg-white/[0.03] text-white/60"}`}>S</button>
        <button type="button" onClick={props.onToggleArm} className={`rounded-xl border px-2 py-2 ${track.armed ? "border-rose-300 bg-rose-400/20 text-rose-100" : "border-white/10 bg-white/[0.03] text-white/60"}`}>R</button>
      </div>

      <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Inserts</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/10 px-2 py-1">EQ {track.fx.eqLowDb || track.fx.eqMidDb || track.fx.eqHighDb ? "On" : "Flat"}</span>
          <span className="rounded-full bg-white/10 px-2 py-1">Comp {track.fx.compEnabled ? "On" : "Off"}</span>
          <span className="rounded-full bg-white/10 px-2 py-1">Vox {track.fx.vocalBusEnabled ? "Bus" : "Off"}</span>
        </div>
        <p className="text-[10px] uppercase tracking-[0.3em] text-white/40">Sends</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <span>Verb {Math.round(track.fx.reverbWet * 100)}%</span>
          <span>Delay {Math.round(track.fx.delayWet * 100)}%</span>
        </div>
      </div>
    </section>
  );
}

export default function ProMixWindow({
  snapshot,
  focusedId,
  onFocusTrack,
  onSetTrackGain,
  onSetTrackPan,
  onToggleMute,
  onToggleSolo,
  onToggleArm,
  onSetMasterGain,
}: ProMixWindowProps) {
  const { tracks, transport, aux } = snapshot;
  const tips = mixDoctor(snapshot);
  const masterPct = percent(Math.sqrt(transport.masterLevel), 0, 1);

  return (
    <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-black to-slate-950 p-4 shadow-2xl shadow-cyan-950/20 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.45em] text-cyan-200/70">EMS Pro Mix Window</p>
          <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">Console-first mixing, mastering intelligence, and release prep.</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">A dedicated console view for gain staging, sends, master checks, mix scenes, and AI guidance without leaving the real Studio Board.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs text-white/70">
          <p className="font-black uppercase tracking-[0.3em] text-white/40">Transport</p>
          <p className="mt-1 text-lg font-black text-white">{transport.bpm} BPM · {transport.isPlaying ? "Playing" : "Stopped"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex min-h-[560px] gap-3 pb-2">
            {tracks.map((track) => (
              <ChannelStrip
                key={track.id}
                track={track}
                selected={track.id === focusedId}
                onFocus={() => onFocusTrack(track.id)}
                onSetGain={(gainDb) => onSetTrackGain(track.id, gainDb)}
                onSetPan={(pan) => onSetTrackPan(track.id, pan)}
                onToggleMute={() => onToggleMute(track.id)}
                onToggleSolo={() => onToggleSolo(track.id)}
                onToggleArm={() => onToggleArm(track.id)}
              />
            ))}

            <section className="min-w-[220px] rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/70">Master Bus</p>
              <h3 className="mt-1 text-lg font-black text-white">Master</h3>
              <div className="mt-4 h-40 overflow-hidden rounded-full bg-black/50 p-1">
                <div className="flex h-full items-end rounded-full bg-white/10">
                  <div className={`w-full rounded-full ${transport.masterTruePeak > 0.96 ? "bg-red-400" : "bg-amber-300"}`} style={{ height: `${masterPct}%` }} />
                </div>
              </div>
              <label className="mt-4 block">
                <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.25em] text-white/50">
                  <span>Master</span>
                  <span>{formatDb(transport.masterDb)}</span>
                </div>
                <input className="w-full accent-amber-300" type="range" min={-60} max={6} step={0.5} value={transport.masterDb} onChange={(event) => onSetMasterGain(Number(event.currentTarget.value))} />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-white/70">
                <span className="rounded-xl bg-black/30 p-2">LUFS<br /><strong className="text-white">{Number.isFinite(transport.masterLufs) ? transport.masterLufs.toFixed(1) : "-inf"}</strong></span>
                <span className="rounded-xl bg-black/30 p-2">Peak<br /><strong className="text-white">{(transport.masterTruePeak * 100).toFixed(0)}%</strong></span>
                <span className="rounded-xl bg-black/30 p-2">Phase<br /><strong className="text-white">{transport.masterPhaseCorrelation.toFixed(2)}</strong></span>
                <span className="rounded-xl bg-black/30 p-2">Limiter<br /><strong className="text-white">{transport.masterLimiterOn ? "On" : "Off"}</strong></span>
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-100/70">AI Mix Doctor</p>
            <div className="mt-3 space-y-2">
              {tips.map((tip) => (
                <p key={tip} className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/75">{tip}</p>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Mix Scenes</p>
            <div className="mt-3 grid gap-2">
              {MIX_SCENES.map((scene) => (
                <button key={scene.name} type="button" className="rounded-2xl border border-white/10 bg-black/30 p-3 text-left hover:border-cyan-200/50">
                  <span className="block text-sm font-black text-white">{scene.name} Mix</span>
                  <span className="text-xs text-white/50">{scene.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Routing</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-xl bg-black/30 p-2">Reverb Return<br /><strong className="text-white">{aux.reverbReturn.enabled ? `${Math.round(aux.reverbReturn.level * 100)}%` : "Off"}</strong></span>
              <span className="rounded-xl bg-black/30 p-2">Delay Return<br /><strong className="text-white">{aux.delayReturn.enabled ? `${Math.round(aux.delayReturn.level * 100)}%` : "Off"}</strong></span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
