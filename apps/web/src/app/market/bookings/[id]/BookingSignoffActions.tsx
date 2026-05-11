"use client";

import { useState } from "react";

// Either-party signoff button. When both sides have signed, the
// server triggers the Stripe Connect transfer to the seller; until
// then the funds stay in escrow.
type Props = {
  bookingId: string;
  youSignedOff: boolean;
  otherSignedOff: boolean;
};

export default function BookingSignoffActions({
  bookingId,
  youSignedOff,
  otherSignedOff,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(youSignedOff);
  const [error, setError] = useState<string | null>(null);

  async function signoff() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/market/bookings/${bookingId}/signoff`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't sign off.");
        setBusy(false);
        return;
      }
      setDone(true);
      const data = (await res.json()) as { bothSignedOff?: boolean };
      // Refresh so the COMPLETED status renders if both parties have
      // now signed off.
      if (data.bothSignedOff) {
        window.location.reload();
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
        Signoff · {otherSignedOff ? "other side ready" : "waiting on both"}
      </div>
      {done ? (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-center text-sm text-emerald-200">
          ✓ You signed off — waiting on the other side.
        </p>
      ) : (
        <button
          type="button"
          onClick={signoff}
          disabled={busy}
          className="w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black uppercase tracking-widest text-black hover:bg-emerald-300 disabled:opacity-50"
        >
          {busy ? "Signing off…" : "Sign off · release funds"}
        </button>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
