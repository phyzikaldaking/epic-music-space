"use client";

type StudioReactiveLightingProps = {
  playing: boolean;
  mode: string;
  selectedColor?: string;
};

export default function StudioReactiveLighting({ playing, mode, selectedColor = "#22d3ee" }: StudioReactiveLightingProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="studio-reactive-lighting"
      className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
      style={{
        ['--studio-accent' as string]: selectedColor,
        opacity: playing ? 0.78 : 0.42,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,45,146,.20),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(34,211,238,.20),transparent_30%),radial-gradient(circle_at_48%_86%,rgba(253,224,71,.12),transparent_34%)]" />
      <div className="absolute left-[-12%] top-[12%] h-[360px] w-[360px] rounded-full blur-3xl animate-pulse" style={{ background: selectedColor, opacity: playing ? 0.22 : 0.1 }} />
      <div className="absolute right-[-8%] top-[22%] h-[420px] w-[420px] rounded-full bg-pink-500/15 blur-3xl animate-pulse" style={{ animationDelay: "220ms" }} />
      <div className="absolute bottom-[-16%] left-[32%] h-[520px] w-[520px] rounded-full bg-cyan-400/12 blur-3xl animate-pulse" style={{ animationDelay: "420ms" }} />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-pink-300/45 to-transparent" />
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/30 px-4 py-1 text-[9px] font-black uppercase tracking-[0.28em] text-white/35 backdrop-blur">
        EMS Studio Atmosphere · {mode} · {playing ? "live pulse" : "idle glow"}
      </div>
    </div>
  );
}
