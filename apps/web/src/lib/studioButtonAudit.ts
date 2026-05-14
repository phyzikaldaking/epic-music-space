export type StudioButtonAuditItem = {
  id: string;
  label: string;
  route: string;
  selector: string;
  action: "navigate" | "api" | "local" | "media" | "download";
  target: string;
  status: "wired" | "needs-worker" | "needs-live-qa";
};

export const studioButtonAudit: StudioButtonAuditItem[] = [
  { id: "studio-home", label: "Studio home", route: "/studio/try", selector: "a[href='/']", action: "navigate", target: "/", status: "wired" },
  { id: "studio-collab", label: "Collab", route: "/studio/try", selector: "a[href='/studio/collab']", action: "navigate", target: "/studio/collab", status: "wired" },
  { id: "studio-export", label: "Export", route: "/studio/try", selector: "a[href='/studio/export']", action: "navigate", target: "/studio/export", status: "wired" },
  { id: "studio-full-beat", label: "Full Beat", route: "/studio/try", selector: "a[href='/studio/beat-machine']", action: "navigate", target: "/studio/beat-machine", status: "wired" },
  { id: "beat-play", label: "Beat play/stop", route: "/studio/beat-machine", selector: "button:has-text('Play')", action: "media", target: "sequencer", status: "needs-live-qa" },
  { id: "beat-midi", label: "MIDI connect", route: "/studio/beat-machine", selector: "button:has-text('MIDI')", action: "media", target: "/api/studio/midi", status: "needs-live-qa" },
  { id: "beat-save-pattern", label: "Save Pattern", route: "/studio/beat-machine", selector: "button:has-text('Save Pattern')", action: "api", target: "/api/studio/beat-patterns", status: "wired" },
  { id: "beat-export-loop", label: "Export Loop", route: "/studio/beat-machine", selector: "button:has-text('Export Loop')", action: "download", target: "ems-beat-loop.wav", status: "wired" },
  { id: "export-full-mix", label: "Export Full Mix", route: "/studio/try", selector: "button:has-text('Export Full Mix')", action: "api", target: "/api/studio/export", status: "needs-worker" },
  { id: "export-stems", label: "Export Stems", route: "/studio/try", selector: "button:has-text('Export Stems')", action: "api", target: "/api/studio/export", status: "needs-worker" },
  { id: "collab-invite", label: "Invite", route: "/studio/collab", selector: "button:has-text('Invite')", action: "local", target: "clipboard", status: "needs-live-qa" },
  { id: "collab-device-check", label: "Device check", route: "/studio/collab", selector: "button:has-text('Run')", action: "media", target: "navigator.mediaDevices", status: "needs-live-qa" },
];

export function summarizeButtonAudit() {
  const total = studioButtonAudit.length;
  const wired = studioButtonAudit.filter((item) => item.status === "wired").length;
  const needsWorker = studioButtonAudit.filter((item) => item.status === "needs-worker").length;
  const needsLiveQa = studioButtonAudit.filter((item) => item.status === "needs-live-qa").length;
  return { total, wired, needsWorker, needsLiveQa, items: studioButtonAudit };
}
