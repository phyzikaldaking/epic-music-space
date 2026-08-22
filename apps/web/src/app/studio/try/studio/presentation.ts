import type { StudioMode } from "./types";

export function getStudioSaveTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("offline") || normalized.includes("failed")) return { tone: "offline" as const, label: status };
  if (normalized.includes("unsaved") || normalized.includes("saving") || normalized.includes("working")) return { tone: "dirty" as const, label: status };
  return { tone: "saved" as const, label: status };
}

export function getStudioAlert(error: string | null, lockWarning: string | null, offline: boolean, missingCount: number) {
  if (error) return { tone: "error" as const, message: error };
  if (lockWarning) return { tone: "warning" as const, message: lockWarning };
  if (offline) return { tone: "warning" as const, message: "Offline: cloud save is paused until the connection returns." };
  if (missingCount) return { tone: "warning" as const, message: `${missingCount} clip${missingCount === 1 ? " is" : "s are"} missing source audio. Relink to play.` };
  return null;
}

export function getEmptyStudioActions() {
  return [
    { id: "import" as const, label: "Import Audio", detail: "WAV, MP3, stems or a full mix" },
    { id: "record" as const, label: "Record", detail: "Capture a vocal or instrument" },
    { id: "beat" as const, label: "Beat Machine", detail: "Build a rhythm from scratch" },
  ];
}

export function getStudioModeLabel(mode: StudioMode) {
  return ({ edit: "Timeline", mix: "Mixer", beat: "Beat Lab", export: "Master & Export", files: "Cloud Files" } satisfies Record<StudioMode, string>)[mode];
}
