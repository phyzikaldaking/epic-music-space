"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";
import { formatPrice } from "@ems/utils";

interface LicenseButtonProps {
  songId: string;
  /** Always the price floor when payWhatYouWant is true; the fixed price
   *  otherwise. Stringly typed because the source is Decimal serialized
   *  from Prisma. */
  licensePrice: string;
  /** True when the producer opted into pay-what-you-want pricing. The
   *  button swaps in a custom-amount input + a "minimum: $X" hint. */
  payWhatYouWant?: boolean;
}

export default function LicenseButton({
  songId,
  licensePrice,
  payWhatYouWant = false,
}: LicenseButtonProps) {
  const [loading, setLoading] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  // PWYW state: pre-fill with the floor so a fan who doesn't want to type
  // anything just clicks through. They can bump it up; the server enforces
  // the floor regardless of what's posted.
  const floor = Number(licensePrice) || 0.5;
  const [customAmount, setCustomAmount] = useState<string>(floor.toFixed(2));
  const router = useRouter();
  const { error } = useToast();

  async function startCheckout() {
    setLoading(true);
    try {
      const body: { songId: string; eulaAccepted: boolean; customAmount?: number } = {
        songId,
        eulaAccepted: true,
      };
      if (payWhatYouWant) {
        const parsed = Number.parseFloat(customAmount);
        if (!Number.isFinite(parsed) || parsed < floor) {
          error(`Minimum is ${formatPrice(licensePrice)}.`);
          setLoading(false);
          return;
        }
        body.customAmount = parsed;
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        router.push("/auth/signin");
        return;
      }
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as { checkoutUrl?: string };
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }
      const text = await res.text().catch(() => "");
      if (res.status === 303 || res.status === 302) {
        const location = res.headers.get("location");
        if (location) {
          window.location.href = location;
          return;
        }
      }
      const parsed = JSON.parse(text || "{}") as { error?: string };
      error(parsed.error ?? "Could not start checkout. Please try again.");
    } catch {
      error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!agreementOpen) {
    if (payWhatYouWant) {
      // Pay-what-you-want: amount input + buy button. The fan picks any
      // amount ≥ floor. We render quick-pick chips so common contributions
      // (1×, 2×, 5× the floor) are one tap away — that's where most fans
      // land in tip-jar UIs.
      const quickPicks = [floor, floor * 2, floor * 5].map((n) => Number(n.toFixed(2)));
      return (
        <div className="space-y-3 rounded-xl border border-tube-300/30 bg-tube-300/[0.06] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-tube-300">
              Pay what you want
            </p>
            <p className="text-[11px] text-white/55">
              Minimum {formatPrice(licensePrice)}
            </p>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-base">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={floor}
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              aria-label="Amount in USD"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-7 pr-3 text-2xl font-bold text-white focus:border-tube-300/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickPicks.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCustomAmount(n.toFixed(2))}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  Number.parseFloat(customAmount) === n
                    ? "border-tube-300 bg-tube-300/15 text-tube-100"
                    : "border-white/12 text-white/65 hover:bg-white/10"
                }`}
              >
                ${n.toFixed(2)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAgreementOpen(true)}
            className="w-full rounded-xl bg-tube-300 py-3.5 text-base font-bold text-black shadow-lg shadow-tube-300/20 transition hover:bg-tube-200"
          >
            License for ${(Number.parseFloat(customAmount) || floor).toFixed(2)}
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setAgreementOpen(true)}
        className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600"
      >
        License this song for {formatPrice(licensePrice)}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-white/45">
        License agreement
      </p>
      <p className="mt-2 text-sm text-white/85">
        By purchasing this license you agree to the{" "}
        <Link href="/license-agreement" target="_blank" className="text-brand-400 hover:underline">
          standard EMS non-exclusive license
        </Link>{" "}
        and our{" "}
        <Link href="/terms" target="_blank" className="text-brand-400 hover:underline">
          Terms of Service
        </Link>
        . Highlights:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/65">
        <li>Worldwide, non-exclusive rights for the media disclosed on this listing.</li>
        <li>You can use this track in your own work; you can&apos;t resell or sub-license the master.</li>
        <li>Sample-clearance + collaborator approval are the artist&apos;s responsibility, not yours.</li>
        <li>Refunds are issued automatically if the listing sells out or is removed before delivery.</li>
      </ul>
      <label className="mt-4 flex items-start gap-2 text-sm text-white/85">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        <span>I&apos;ve read and accept the license terms above.</span>
      </label>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setAgreementOpen(false);
            setAgreed(false);
          }}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/65 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={!agreed || loading}
          className="flex-1 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-50"
        >
          {loading
            ? "Redirecting…"
            : `Agree & continue → ${
                payWhatYouWant
                  ? `$${(Number.parseFloat(customAmount) || floor).toFixed(2)}`
                  : formatPrice(licensePrice)
              }`}
        </button>
      </div>
    </div>
  );
}
