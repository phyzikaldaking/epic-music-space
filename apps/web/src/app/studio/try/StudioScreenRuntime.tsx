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
  studio: { title: "Studio Command", description: "Timeline, mixer, sound browser, inspector, and active session tools." },
  edit: { title: "Edit Screen", description: "Recording, clips, vocal work, regions, and detailed editing." },
  mix: { title: "Mix Screen", description: "Mixer, faders, meters, pan controls, routing, buses, and master strip." },
  beat: { title: "Beat Screen", description: "Pads, drum sequencing, instruments, sound uploads, and beat workflow." },
  collab: { title: "Collab Screen", description: "Realtime collaboration, team presence, invites, and session notes." },
  export: { title: "Export Screen", description: "Bounce, stems, deliverables, recovery state, and release preparation." },
  mastering: { title: "Mastering Screen", description: "Spectral tools, loudness, polish, references, and release-readiness checks." },
  live: { title: "Live Session Screen", description: "Listening sessions, host controls, audience interaction, and live room flow." },
};

export default function StudioScreenRuntime({ mode, activeLabel, timeline, inspector, rack, spectral, children }: StudioScreenRuntimeProps) {
  const meta = screenMeta[mode] ?? screenMeta.studio;
  const isStudio = mode === "studio";

  return (
    <section
      data-testid="studio-screen-runtime"
      data-studio-mode={mode}
      className="min-h-[calc(100dvh-112px)] w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#071015]/80 p-2"
    >
      <header className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[.03] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-cyan-200/65">Active screen</p>
          <h1 data-testid="studio-active-screen" className="truncate text-lg font-black uppercase tracking-wider text-white sm:text-xl">{activeLabel}</h1>
          <p className="mt-0.5 hidden max-w-3xl text-[11px] text-white/45 lg:block">{meta.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[9px] uppercase tracking-widest text-white/40">
          <span className="hidden lg:inline">{meta.title}</span>
          <Link href="/listening-sessions" className="rounded-full border border-pink-300/30 px-3 py-1 font-black text-pink-100">Live rooms</Link>
        </div>
      </header>

      {isStudio && timeline ? (
        <div className="grid h-[calc(100dvh-190px)] min-h-[620px] min-w-0 grid-rows-[minmax(210px,32vh)_1fr] gap-2 overflow-hidden">
          <div data-testid="studio-timeline-zone" className="min-h-0 overflow-hidden rounded-xl">{timeline}</div>
          <div className="grid min-h-0 min-w-0 grid-cols-1 gap-2 overflow-hidden xl:grid-cols-[240px_minmax(0,1fr)_220px]">
            <div data-testid="studio-inspector-zone" className="hidden min-h-0 overflow-hidden xl:block">{inspector}</div>
            <main data-testid="studio-mode-zone" className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">{children}</main>
            <div data-testid="studio-rack-zone" className="hidden min-h-0 overflow-hidden xl:block">{rack}</div>
          </div>
        </div>
      ) : (
        <main data-testid="studio-mode-zone" className="h-[calc(100dvh-190px)] min-h-[620px] min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/25 p-2">{children}</main>
      )}

      {spectral ? <div data-testid="studio-spectral-zone" className="mt-2 min-w-0 overflow-hidden">{spectral}</div> : null}
    </section>
  );
}
