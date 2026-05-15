import Link from "next/link";
import type { ReactNode } from "react";
import type { StudioMode } from "./studioWorkstationTypes";

export type StudioRuntimeMode = StudioMode | "mastering" | "live";

type StudioScreenRuntimeProps = {
  mode: StudioRuntimeMode;
  activeLabel: string;
  timeline?: ReactNode;
  inspector?: ReactNode;
  rack?: ReactNode;
  spectral?: ReactNode;
  children: ReactNode;
};

const screenMeta: Record<StudioRuntimeMode, { title: string; description: string }> = {
  studio: { title: "Studio Command", description: "Launcher, timeline, inspector, plugin rack, and session overview." },
  edit: { title: "Edit Screen", description: "Recording, clips, vocal work, regions, and detailed editing." },
  mix: { title: "Mix Screen", description: "Mixer, faders, meters, pan controls, routing, buses, and master strip." },
  beat: { title: "Beat Screen", description: "Pads, drum sequencing, instrument lanes, rhythm creation, and beat workflow." },
  collab: { title: "Collab Screen", description: "Realtime collaboration, team presence, invites, and session notes." },
  export: { title: "Export Screen", description: "Bounce, stems, deliverables, recovery state, and release preparation." },
  mastering: { title: "Mastering Screen", description: "Spectral tools, loudness, polish, references, and release-readiness checks." },
  live: { title: "Live Session Screen", description: "Listening sessions, host controls, audience interaction, and live room flow." },
};

export default function StudioScreenRuntime({ mode, activeLabel, timeline, inspector, rack, spectral, children }: StudioScreenRuntimeProps) {
  const meta = screenMeta[mode] ?? screenMeta.studio;
  const isStudio = mode === "studio";

  return (
    <section data-testid="studio-screen-runtime" data-studio-mode={mode} className="min-h-[900px] min-w-[1240px] rounded-xl border border-white/10 bg-[#071015]/80 p-2">
      <header className="mb-2 flex items-center justify-between rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200/65">Active screen</p>
          <h1 data-testid="studio-active-screen" className="text-2xl font-black uppercase tracking-wider text-white">{activeLabel}</h1>
          <p className="mt-1 max-w-3xl text-xs text-white/45">{meta.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-[10px] uppercase tracking-widest text-white/40">
          <span>Scroll: window-level</span>
          <span>Mode: {meta.title}</span>
          <Link href="/listening-sessions" className="rounded-full border border-pink-300/30 px-3 py-1 font-black text-pink-100">Live rooms</Link>
        </div>
      </header>

      {isStudio && timeline ? (
        <div className="grid min-w-[1240px] grid-rows-[360px_minmax(640px,1fr)] gap-2">
          <div data-testid="studio-timeline-zone">{timeline}</div>
          <div className="grid min-w-[1240px] grid-cols-[280px_minmax(720px,1fr)_240px] gap-2">
            <div data-testid="studio-inspector-zone">{inspector}</div>
            <main data-testid="studio-mode-zone" className="min-h-[640px]">{children}</main>
            <div data-testid="studio-rack-zone">{rack}</div>
          </div>
        </div>
      ) : (
        <main data-testid="studio-mode-zone" className="min-h-[760px] min-w-[1240px] rounded-xl border border-white/10 bg-black/25 p-2">{children}</main>
      )}

      {spectral ? <div data-testid="studio-spectral-zone" className="mt-2 min-w-[1240px]">{spectral}</div> : null}
    </section>
  );
}
