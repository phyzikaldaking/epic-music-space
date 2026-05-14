"use client";

type Props = {
  status: "idle" | "checking" | "saved" | "recoverable" | "restored" | "error";
  lastSavedAt: string | null;
  canRestore: boolean;
  onSave: () => void;
  onRestore: () => void;
};

function label(status: Props["status"]) {
  if (status === "checking") return "Checking recovery";
  if (status === "saved") return "Autosaved";
  if (status === "recoverable") return "Recovery available";
  if (status === "restored") return "Restored";
  if (status === "error") return "Autosave offline";
  return "Autosave ready";
}

export default function StudioRecoveryStatus({ status, lastSavedAt, canRestore, onSave, onRestore }: Props) {
  const tone = status === "error" ? "border-red-300/30 text-red-100" : status === "recoverable" ? "border-yellow-300/35 text-yellow-100" : "border-cyan-300/30 text-cyan-100";
  return (
    <div className={`flex h-9 items-center gap-2 rounded-full border bg-black/45 px-3 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      <span>{label(status)}</span>
      {lastSavedAt && <span className="hidden text-white/35 lg:inline">{new Date(lastSavedAt).toLocaleTimeString()}</span>}
      {canRestore && <button onClick={onRestore} className="rounded-full border border-yellow-300/35 px-2 py-1 text-yellow-100">Restore</button>}
      <button onClick={onSave} className="rounded-full border border-white/10 px-2 py-1 text-white/60">Save</button>
    </div>
  );
}
