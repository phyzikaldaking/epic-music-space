"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/contexts/ToastContext";
import { formatPrice } from "@ems/utils";

interface LicenseButtonProps {
  songId: string;
  licensePrice: string;
}

export default function LicenseButton({ songId, licensePrice }: LicenseButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { error } = useToast();

  async function handleLicense() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
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
        const data = await res.json() as { checkoutUrl?: string };
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }

      // 303 redirect — follow it
      const text = await res.text().catch(() => "");
      if (res.status === 303 || res.status === 302) {
        const location = res.headers.get("location");
        if (location) { window.location.href = location; return; }
      }

      const parsed = JSON.parse(text || "{}") as { error?: string };
      error(parsed.error ?? "Could not start checkout. Please try again.");
    } catch {
      error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLicense()}
      disabled={loading}
      className="w-full rounded-xl bg-brand-500 py-3.5 text-base font-bold text-white transition hover:bg-brand-600 disabled:opacity-60 shadow-lg shadow-brand-500/20"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Redirecting to checkout…
        </span>
      ) : (
        `License this song for ${formatPrice(licensePrice)}`
      )}
    </button>
  );
}
