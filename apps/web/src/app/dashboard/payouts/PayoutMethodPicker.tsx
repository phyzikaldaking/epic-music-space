"use client";

import { useEffect, useState } from "react";

type Method = "STRIPE" | "PAYPAL";

interface State {
  method: Method;
  paypalEmail: string;
  stripeReady: boolean;
}

/**
 * Lets an artist switch between Stripe Connect and PayPal Payouts. Only
 * one rail is "active" at a time — the one our worker uses to route
 * earned funds.
 *
 * PayPal is intentionally simple: the artist supplies the email PayPal
 * will credit. We don't open a PayPal-side OAuth flow because the
 * Payouts API doesn't require it (it's a server-to-server transfer
 * from our balance to the recipient email).
 *
 * Cash App is *not* exposed here as a payout option — Cash App has no
 * programmatic payout API. Fans CAN pay with Cash App at checkout; that
 * surface is the Stripe Checkout configuration, not this picker.
 */
export default function PayoutMethodPicker() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Local form state (separate from server state so a half-typed PayPal
  // email doesn't get sent before the user hits Save).
  const [draftMethod, setDraftMethod] = useState<Method>("STRIPE");
  const [draftEmail, setDraftEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/payout/method")
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load payout settings.");
        return (await res.json()) as State;
      })
      .then((data) => {
        if (cancelled) return;
        setState(data);
        setDraftMethod(data.method);
        setDraftEmail(data.paypalEmail ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load payout settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (saving) return;
    setError(null);
    setConfirmation(null);
    if (draftMethod === "PAYPAL" && !draftEmail.trim()) {
      setError("Add the PayPal email payouts should go to.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payout/method", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: draftMethod,
          paypalEmail:
            draftMethod === "PAYPAL" ? draftEmail.trim() : undefined,
        }),
      });
      const body = (await res.json()) as { error?: string } & State;
      if (!res.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      setState(body);
      setConfirmation(
        body.method === "PAYPAL"
          ? `Saved — payouts will go to ${body.paypalEmail}.`
          : "Saved — payouts will go through Stripe Connect.",
      );
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/45">
        Loading payout settings…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
        {error ?? "Couldn't load payout settings."}
      </div>
    );
  }

  const dirty =
    draftMethod !== state.method ||
    (draftMethod === "PAYPAL" && draftEmail.trim() !== (state.paypalEmail ?? ""));

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/45">
            Payout method
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">How you get paid</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
            state.method === "STRIPE"
              ? state.stripeReady
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
              : "bg-blue-500/15 text-blue-300"
          }`}
        >
          {state.method === "STRIPE"
            ? state.stripeReady
              ? "Stripe ready"
              : "Stripe pending KYC"
            : "PayPal active"}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDraftMethod("STRIPE")}
          className={`rounded-xl border p-4 text-left transition ${
            draftMethod === "STRIPE"
              ? "border-brand-500/60 bg-brand-500/15"
              : "border-white/10 bg-white/[0.02] hover:border-white/25"
          }`}
        >
          <p className="text-sm font-bold text-white">Stripe Connect</p>
          <p className="mt-1 text-xs text-white/55">
            Direct deposit to bank accounts. Required for US, EU, UK, AU.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDraftMethod("PAYPAL")}
          className={`rounded-xl border p-4 text-left transition ${
            draftMethod === "PAYPAL"
              ? "border-brand-500/60 bg-brand-500/15"
              : "border-white/10 bg-white/[0.02] hover:border-white/25"
          }`}
        >
          <p className="text-sm font-bold text-white">PayPal</p>
          <p className="mt-1 text-xs text-white/55">
            Sent to a PayPal email. Works in 200+ countries Stripe doesn&apos;t
            cover.
          </p>
        </button>
      </div>

      {draftMethod === "PAYPAL" && (
        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45">
            PayPal email
          </span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={draftEmail}
            onChange={(e) => setDraftEmail(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/25 focus:border-brand-500/70 focus:outline-none"
          />
          <p className="mt-1 text-[11px] text-white/40">
            Make sure this matches a verified PayPal account, or the payout
            won&apos;t clear.
          </p>
        </label>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </p>
      )}
      {confirmation && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
        >
          {confirmation}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-xl bg-brand-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save method"}
        </button>
      </div>
    </div>
  );
}
