import React from "react";

const STEP_LABELS = ["Paid", "In progress", "Delivered", "Approved"] as const;

function stageForStatus(status: string): { kind: "normal"; index: number } | { kind: "terminal"; label: string; tone: "red" | "emerald" } {
  switch (status) {
    case "PENDING":
      return { kind: "normal", index: 0 };
    case "PAID":
    case "IN_PROGRESS":
      return { kind: "normal", index: 1 };
    case "DELIVERED":
    case "REVISION_REQUESTED":
      return { kind: "normal", index: 2 };
    case "COMPLETED":
      return { kind: "terminal", label: "Approved", tone: "emerald" };
    case "REFUNDED":
      return { kind: "terminal", label: "Refunded", tone: "red" };
    case "CANCELLED":
      return { kind: "terminal", label: "Cancelled", tone: "red" };
    default:
      return { kind: "normal", index: 0 };
  }
}

export default function ServiceOrderStageBar({ status }: { status: string }) {
  const stage = stageForStatus(status);

  if (stage.kind === "terminal") {
    return (
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${stage.tone === "emerald" ? "bg-emerald-400/60" : "bg-red-400/60"}`} style={{ width: "100%" }} />
        </div>
        <span
          className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
            stage.tone === "emerald"
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : "border-red-400/40 bg-red-400/10 text-red-300"
          }`}
        >
          {stage.label}
        </span>
      </div>
    );
  }

  // 0 = pending payment (no progress), 1..3 = progress.
  const pct = stage.index <= 0 ? 8 : Math.min(100, Math.round((stage.index / (STEP_LABELS.length - 1)) * 100));

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
        <span>{stage.index === 0 ? "Pending payment" : STEP_LABELS[Math.max(0, stage.index - 1)]}</span>
        <span>{status.replace(/_/g, " ")}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-amber-400/60" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[10px] font-semibold text-white/35">
        {STEP_LABELS.map((label, i) => {
          const active = i <= Math.max(0, stage.index - 1);
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  active ? "bg-amber-300" : "bg-white/15"
                }`}
              />
              <span className={active ? "text-white/60" : ""}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

