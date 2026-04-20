"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const LOCATIONS = [
  { key: "MARKETPLACE_BANNER", label: "Marketplace Banner", dailyRate: 99 },
  { key: "STUDIO_SIDEBAR", label: "Studio Sidebar", dailyRate: 49 },
  { key: "CITY_BILLBOARD", label: "City Billboard", dailyRate: 199 },
  { key: "VERSUS_BANNER", label: "Versus Banner", dailyRate: 79 },
];

export default function AdPurchaseForm() {
  const router = useRouter();
  const [location, setLocation] = useState(LOCATIONS[0].key);
  const [title, setTitle] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedLoc = LOCATIONS.find((l) => l.key === location) ?? LOCATIONS[0];
  const days =
    startDate && endDate
      ? Math.max(
          1,
          Math.ceil(
            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1;
  const totalPrice = selectedLoc.dailyRate * days;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title || !mediaUrl || !startDate || !endDate) {
      setError("Please fill in all required fields.");
      return;
    }

    // Convert date strings to ISO datetime strings
    const startDatetime = new Date(startDate + "T00:00:00Z").toISOString();
    const endDatetime = new Date(endDate + "T23:59:59Z").toISOString();

    setLoading(true);
    try {
      const res = await fetch("/api/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location,
          title,
          mediaUrl,
          linkUrl: linkUrl || undefined,
          startDate: startDatetime,
          endDate: endDatetime,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create ad placement.");
        return;
      }

      // Redirect to Stripe checkout
      if (data.checkoutUrl) {
        router.push(data.checkoutUrl);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      {error && (
        <div className="sm:col-span-2 rounded-xl bg-red-500/20 border border-red-500/30 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Location *</label>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        >
          {LOCATIONS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label} — ${l.dailyRate}/day
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Ad Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. New EP Out Now"
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Image URL *</label>
        <input
          type="url"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="https://..."
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Link URL (optional)</label>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://..."
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">Start Date *</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-white/60">End Date *</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate || new Date().toISOString().split("T")[0]}
          className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="sm:col-span-2">
        {startDate && endDate && (
          <p className="mb-3 text-sm text-white/60">
            {days} day{days !== 1 ? "s" : ""} ×{" "}
            <span className="text-white">${selectedLoc.dailyRate}/day</span> ={" "}
            <span className="font-bold text-brand-400">${totalPrice} total</span>
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold hover:bg-brand-600 transition disabled:opacity-50"
        >
          {loading ? "Redirecting to payment…" : "Proceed to Payment →"}
        </button>
      </div>
    </form>
  );
}
