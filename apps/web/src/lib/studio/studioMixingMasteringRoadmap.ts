export type StudioMixMasterFeature = {
  id: number;
  title: string;
  category: "fx" | "metering" | "gain" | "bus" | "compare" | "reference" | "mastering" | "export" | "qc";
  priority: "v1" | "v1_5" | "v2";
  status: "planned" | "scaffolded" | "active";
  description: string;
};

export const STUDIO_MIXING_MASTERING_ROADMAP: StudioMixMasterFeature[] = [
  {
    id: 41,
    title: "Send-first FX defaults with reusable mixer templates",
    category: "fx",
    priority: "v1",
    status: "scaffolded",
    description: "Default reverb, delay, parallel, and vocal bus send layouts for fast hip-hop/R&B sessions.",
  },
  {
    id: 42,
    title: "Pro metering suite",
    category: "metering",
    priority: "v1",
    status: "planned",
    description: "LUFS, true peak, phase correlation, and stereo image views for mix and master confidence.",
  },
  {
    id: 43,
    title: "Gain staging assistant with headroom enforcement",
    category: "gain",
    priority: "v1",
    status: "planned",
    description: "Warns on hot channels, suggests trim moves, and keeps mix bus headroom before mastering.",
  },
  {
    id: 44,
    title: "Bus processing workflows",
    category: "bus",
    priority: "v1",
    status: "scaffolded",
    description: "Drum bus, vocal bus, music bus, FX bus, and parallel compression paths.",
  },
  {
    id: 45,
    title: "Snapshot-based mix A/B compare",
    category: "compare",
    priority: "v1_5",
    status: "planned",
    description: "Save and compare mix snapshots without destroying the current session state.",
  },
  {
    id: 46,
    title: "Reference track lane with instant loudness matching",
    category: "reference",
    priority: "v1_5",
    status: "planned",
    description: "Load a reference track, level-match it, and compare tone, width, and loudness safely.",
  },
  {
    id: 47,
    title: "AI mastering with genre targets and explainable settings",
    category: "mastering",
    priority: "v1",
    status: "planned",
    description: "Hip-hop, R&B, drill, trap, afro-fusion, podcast, social, and DSP mastering targets with plain-English settings.",
  },
  {
    id: 48,
    title: "Mastering chain bypass groups and safe limiter guardrails",
    category: "mastering",
    priority: "v1",
    status: "planned",
    description: "Bypass grouped mastering stages and prevent unsafe limiter or clipping states.",
  },
  {
    id: 49,
    title: "Export presets",
    category: "export",
    priority: "v1",
    status: "scaffolded",
    description: "DSP-ready, social, stems, archive, and demo export presets with format and quality defaults.",
  },
  {
    id: 50,
    title: "QC checker",
    category: "qc",
    priority: "v1",
    status: "planned",
    description: "Checks clipping, DC offset, mono compatibility, loudness, true peak, and export readiness.",
  },
];

export const STUDIO_EXPORT_PRESETS = {
  dspReady: {
    label: "DSP Ready",
    format: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    targetLufs: -14,
    truePeakCeilingDb: -1,
  },
  social: {
    label: "Social",
    format: "mp3",
    bitrateKbps: 320,
    targetLufs: -14,
    truePeakCeilingDb: -1,
  },
  stems: {
    label: "Stems",
    format: "zip_stems",
    sampleRate: 48000,
    bitDepth: 24,
    includeMaster: true,
  },
  archive: {
    label: "Archive",
    format: "flac",
    sampleRate: 48000,
    bitDepth: 24,
    lossless: true,
  },
  demo: {
    label: "Demo",
    format: "m4a",
    bitrateKbps: 256,
    watermarkAllowed: true,
  },
} as const;

export const STUDIO_QC_CHECKS = [
  "clipping",
  "dc_offset",
  "mono_compatibility",
  "integrated_lufs",
  "true_peak",
  "stereo_width",
  "headroom",
] as const;
