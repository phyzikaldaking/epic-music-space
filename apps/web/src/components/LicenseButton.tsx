"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";
import { formatPrice } from "@ems/utils";

interface LicenseButtonProps {
  songId: string;
  licensePrice: string;
}

export default function LicenseButton({ songId, licensePrice }: LicenseButtonProps) {
  const [loading, setLoading] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();
  const { error } = useToast();

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, eulaAccepted: true }),
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
          {loading ? "Redirecting…" : `Agree & continue → ${formatPrice(licensePrice)}`}
        </button>
      </div>
    </div>
  );
}
