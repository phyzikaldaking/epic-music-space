import type { ReactNode, SVGProps } from "react";

export type StudioIconName = "archive" | "beat" | "cloud" | "download" | "files" | "grid" | "import" | "loop" | "mixer" | "pause" | "play" | "record" | "save" | "spark" | "stop" | "timeline" | "undo" | "zoomIn" | "zoomOut";

const paths: Record<StudioIconName, ReactNode> = {
  archive: <><path d="M4 7h16v13H4z"/><path d="M3 3h18v4H3zM9 11h6"/></>,
  beat: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
  cloud: <path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 8.2 5 5 0 0 0 7 18Z"/>,
  download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></>,
  files: <><path d="M4 4h6l2 3h8v13H4z"/><path d="M8 12h8m-8 4h5"/></>,
  grid: <><path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/></>,
  import: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 19h16v2H4z"/></>,
  loop: <><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
  mixer: <><path d="M4 6h10m4 0h2M4 12h3m4 0h9M4 18h8m4 0h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></>,
  pause: <path d="M8 5h3v14H8zm5 0h3v14h-3z" fill="currentColor" stroke="none"/>,
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>,
  record: <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>,
  save: <><path d="M5 3h12l3 3v15H4V3z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  spark: <><path d="m12 2 1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>,
  timeline: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v18"/></>,
  undo: <><path d="m9 7-5 5 5 5"/><path d="M4 12h9a6 6 0 0 1 6 6"/></>,
  zoomIn: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></>,
  zoomOut: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/></>,
};

export function StudioIcon({ name, ...props }: { name: StudioIconName } & SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
