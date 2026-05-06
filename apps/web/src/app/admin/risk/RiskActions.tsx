"use client";

import { useState } from "react";

type RiskAction = "dismiss" | "escalate" | "flag_user" | "suspend_user";

export default function RiskActions({
  eventId,
  hasSubject,
}: {
  eventId: string;
  hasSubject: boolean;
}) {
  const [pending, setPending] = useState<RiskAction | null>(null);
  const [done, setDone] = useState(false);

  async function run(action: RiskAction) {
    const note =
      action === "suspend_user"
        ? window.prompt("Suspension reason")
        : action === "escalate"
          ? window.prompt("Escalation note", "")
          : "";
    if (action === "suspend_user" && !note) return;
    setPending(action);
    try {
      const res = await fetch(`/api/admin/risk/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Risk action failed");
      }
      setDone(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Risk action failed");
    } finally {
      setPending(null);
    }
  }

  if (done) {
    return <span className="text-xs font-semibold text-emerald-300">updated</span>;
  }

  const buttonClass = "rounded border border-white/15 px-2 py-1 text-[11px] font-bold text-white/65 hover:bg-white/8 disabled:opacity-40";

  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" disabled={Boolean(pending)} onClick={() => run("dismiss")} className={buttonClass}>
        Dismiss
      </button>
      <button type="button" disabled={Boolean(pending)} onClick={() => run("escalate")} className={buttonClass}>
        Escalate
      </button>
      <button type="button" disabled={!hasSubject || Boolean(pending)} onClick={() => run("flag_user")} className={buttonClass}>
        Flag
      </button>
      <button type="button" disabled={!hasSubject || Boolean(pending)} onClick={() => run("suspend_user")} className="rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-200 hover:bg-red-500/20 disabled:opacity-40">
        Suspend
      </button>
    </div>
  );
}
