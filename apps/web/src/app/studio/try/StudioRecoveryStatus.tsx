"use client";

type Props = {
  status: "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";
  lastSavedAt: string | null;
  canRestore: boolean;
  onSave: () => void;
  onRestore: () => void;
};

function label(status: Props["status"]) {
  if (status === "checking") return "Syncing cloud";
  if (status === "saved") return "Saved to cloud";
  if (status === "recoverable") return "Cloud restore available";
  if (status === "restored") return "Restored from cloud";
  if (status === "error") return "Cloud sync failed";
  return "Cloud ready";
}

function relativeTime(value: string | null) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "Saved";
  const seconds = Math.max(0, Math.round(diff / 1000));
  if (seconds < 10) return "Saved just now";
  if (seconds < 60) return `Saved ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  return `Saved ${date.toLocaleDateString()}`;
}

export default function StudioRecoveryStatus({ status, lastSavedAt, canRestore, onSave, onRestore }: Props) {
  const tone = status === "error" ? "border-red-300/30 text-red-100" : status === "recoverable" ? "border-yellow-300/35 text-yellow-100" : status === "saved" || status === "restored" ? "border-green-300/30 text-green-100" : "border-cyan-300/30 text-cyan-100";
  const backendLabel = status === "error" ? "Local preserved" : "Postgres cloud";
  return (
    <div className={`flex min-h-9 items-center gap-2 rounded-full border bg-black/45 px-2 py-1 text-[9px] font-black uppercase tracking-widest ${tone}`}>
      <span className="hidden lg:inline">{label(status)}</span>
      <span className="rounded-full border border-white/10 px-2 py-1 text-white/45">{backendLabel}</span>
      <span className="hidden max-w-[110px] truncate text-white/35 xl:inline">{relativeTime(lastSavedAt)}</span>
      {canRestore && (
        <button type="button" onClick={onRestore} className="rounded-full border border-yellow-300/35 px-2 py-1 text-yellow-100 hover:bg-yellow-300/10">
          Restore Cloud
        </button>
      )}
      <button type="button" onClick={onSave} disabled={status === "checking"} className="rounded-full border border-cyan-300/25 px-2 py-1 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-45">
        Save Cloud
      </button>
    </div>
  );
}
