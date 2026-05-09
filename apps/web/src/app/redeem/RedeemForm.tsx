"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface RedeemSuccess {
  reward: {
    bonusSongSlots?: number;
    trialDays?: number;
    freeBoostCredits?: number;
    freeLicenseFeeWaivers?: number;
    note?: string;
  };
  trialExpiresAt: string | null;
}

function rewardLines(reward: RedeemSuccess["reward"]): string[] {
  const lines: string[] = [];
  if (reward.bonusSongSlots) lines.push(`+${reward.bonusSongSlots} extra song slots`);
  if (reward.trialDays) lines.push(`+${reward.trialDays}-day Pro trial`);
  if (reward.freeBoostCredits)
    lines.push(`${reward.freeBoostCredits} free Boost credit${reward.freeBoostCredits === 1 ? "" : "s"}`);
  if (reward.freeLicenseFeeWaivers)
    lines.push(`${reward.freeLicenseFeeWaivers} license fee waiver${reward.freeLicenseFeeWaivers === 1 ? "" : "s"}`);
  return lines;
}

export default function RedeemForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RedeemSuccess | null>(null);
  const [, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter a code first.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const body = (await res.json()) as { error?: string } & RedeemSuccess;
      if (!res.ok) {
        setError(body.error ?? "Couldn't redeem that code.");
        return;
      }
      setSuccess(body);
      setCode("");
      // Pull updated counters into the wrapping page so the perks
      // panel reflects the grant immediately.
      startTransition(() => router.refresh());
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 studio-faceplate p-5"
    >
      <label
        htmlFor="redeem-code"
        className="mb-1 block text-xs font-bold uppercase tracking-widest text-white/45"
      >
        Code
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="redeem-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="EMS-WELCOME-5K"
          maxLength={64}
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-lg uppercase tracking-widest text-white placeholder:text-white/25 focus:border-brand-500/70 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
        >
          {busy ? "Redeeming…" : "Redeem"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
        >
          {error}
        </p>
      )}

      {success && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100"
        >
          <p className="font-bold">Redeemed.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-emerald-200/85">
            {rewardLines(success.reward).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {success.reward.note && (
            <p className="mt-2 text-xs italic text-emerald-200/70">
              {success.reward.note}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
