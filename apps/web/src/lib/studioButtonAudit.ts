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
  { id: "studio-export", label: "Export", route: "/studio/try", selector: "button:has-text('Export')", action: "local", target: "studio export panel", status: "wired" },
  { id: "studio-full-beat", label: "Full Beat", route: "/studio/try", selector: "button:has-text('Open Beat Machine')", action: "navigate", target: "/studio/beat-machine", status: "wired" },
  { id: "studio-metronome", label: "Metronome toggle", route: "/studio/try", selector: "button:has-text('Metro')", action: "local", target: "metronome state", status: "wired" },
  { id: "studio-count-in", label: "Count-in selector", route: "/studio/try", selector: "select:near(:text('Count-in'))", action: "local", target: "count-in bars", status: "wired" },
  { id: "studio-record-arm", label: "Record arm target", route: "/studio/try", selector: "button:has-text('Arm')", action: "local", target: "single armed recording track", status: "wired" },
  { id: "studio-fix-clipping", label: "Fix clipping", route: "/studio/try", selector: "button:has-text('Fix it')", action: "local", target: "track volume and input gain", status: "wired" },
  { id: "studio-input-gain", label: "Input gain calibration", route: "/studio/try", selector: "button:has-text('Calibrate input gain')", action: "local", target: "track input gain", status: "wired" },
  { id: "studio-export-mp3", label: "Export MP3 demo", route: "/studio/try", selector: "button:has-text('MP3 demo')", action: "download", target: "mp3-demo export manifest", status: "wired" },
  { id: "studio-export-wav", label: "Export WAV master", route: "/studio/try", selector: "button:has-text('WAV master')", action: "download", target: "wav-master export manifest", status: "wired" },
  { id: "studio-export-stems", label: "Export stems", route: "/studio/try", selector: "button:has-text('Stems')", action: "download", target: "stems export manifest", status: "wired" },
  { id: "studio-export-social", label: "Export social preview", route: "/studio/try", selector: "button:has-text('Social preview')", action: "download", target: "social-preview export manifest", status: "wired" },
  { id: "studio-share-private-link", label: "Share private link", route: "/studio/try", selector: "button:has-text('Create link')", action: "local", target: "private session URL", status: "wired" },
  { id: "studio-copy-private-link", label: "Copy private link", route: "/studio/try", selector: "button:has-text('Copy')", action: "local", target: "clipboard", status: "needs-live-qa" },
  { id: "studio-invite-collaborator", label: "Invite collaborator", route: "/studio/try", selector: "button:has-text('Invite collaborator')", action: "local", target: "invite list with role", status: "wired" },
  { id: "beat-play", label: "Beat play/stop", route: "/studio/beat-machine", selector: "button:has-text('Play')", action: "media", target: "sequencer", status: "needs-live-qa" },
  { id: "beat-midi", label: "MIDI connect", route: "/studio/beat-machine", selector: "button:has-text('MIDI')", action: "media", target: "/api/studio/midi", status: "needs-live-qa" },
  { id: "beat-save-pattern", label: "Save Pattern", route: "/studio/beat-machine", selector: "button:has-text('Save Pattern')", action: "api", target: "/api/studio/beat-patterns", status: "wired" },
  { id: "beat-export-loop", label: "Export Loop", route: "/studio/beat-machine", selector: "button:has-text('Export Loop')", action: "download", target: "ems-beat-loop.wav", status: "wired" },
  { id: "collab-device-check", label: "Device check", route: "/studio/collab", selector: "button:has-text('Run')", action: "media", target: "navigator.mediaDevices", status: "needs-live-qa" },
];

export function summarizeButtonAudit() {
  const total = studioButtonAudit.length;
  const wired = studioButtonAudit.filter((item) => item.status === "wired").length;
  const needsWorker = studioButtonAudit.filter((item) => item.status === "needs-worker").length;
  const needsLiveQa = studioButtonAudit.filter((item) => item.status === "needs-live-qa").length;
  return { total, wired, needsWorker, needsLiveQa, items: studioButtonAudit };
}
