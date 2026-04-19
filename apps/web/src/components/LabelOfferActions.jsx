"use client";
import { useState } from "react";
export default function LabelOfferActions({ labelId, revSharePct, labelName, }) {
    const [status, setStatus] = useState("PENDING");
    const [loading, setLoading] = useState(false);
    async function respond(action) {
        if (loading)
            return;
        setLoading(true);
        try {
            const res = await fetch(`/api/labels/${labelId}/artists`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            if (res.ok) {
                const data = await res.json();
                setStatus(data.status);
            }
        }
        finally {
            setLoading(false);
        }
    }
    if (status === "ACTIVE") {
        return (<div className="rounded-2xl bg-green-500/20 border border-green-500/30 p-4 text-green-400 text-sm">
        ✅ You accepted the offer from {labelName}. You are now signed.
      </div>);
    }
    if (status === "TERMINATED") {
        return (<div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-white/40 text-sm">
        Offer declined.
      </div>);
    }
    return (<section className="mb-8 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5">
      <h3 className="mb-2 font-semibold text-yellow-400">📩 Label Offer Pending</h3>
      <p className="mb-4 text-sm text-white/60">
        {labelName} has offered you a{" "}
        <strong className="text-white">{revSharePct}%</strong> revenue-share deal.
        They will receive that percentage of your licensing earnings going forward.
      </p>
      <div className="flex gap-3">
        <button onClick={() => respond("accept")} disabled={loading} className="rounded-xl bg-green-600 px-5 py-2 text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50">
          Accept
        </button>
        <button onClick={() => respond("decline")} disabled={loading} className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold hover:bg-white/10 transition disabled:opacity-50">
          Decline
        </button>
      </div>
    </section>);
}
