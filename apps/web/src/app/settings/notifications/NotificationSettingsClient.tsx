"use client";

import { useEffect, useState } from "react";

interface PrefRow {
  type: string;
  inApp: boolean;
  email: boolean;
}

const TYPES: { type: string; label: string; description: string }[] = [
  { type: "POST_LIKED", label: "Likes on your posts", description: "Someone liked something you posted." },
  { type: "POST_COMMENTED", label: "Comments on your posts", description: "Someone commented on your post." },
  { type: "FOLLOWED_POST", label: "Posts from artists you follow", description: "An artist you follow shared something new." },
  { type: "FOLLOW", label: "New followers", description: "Someone started following you." },
  { type: "LICENSE_SOLD", label: "License sales", description: "Someone licensed one of your tracks." },
  { type: "PAYOUT", label: "Payouts", description: "A payout to your bank cleared." },
  { type: "TIP", label: "Tips", description: "Someone tipped you." },
  { type: "VERSUS_RESULT", label: "Versus battle results", description: "Your battle ended — win or lose." },
  { type: "AUCTION_BID_RECEIVED", label: "Auction bids on your tracks", description: "Someone bid on your auction." },
  { type: "AUCTION_OUTBID", label: "You were outbid", description: "Someone topped your auction bid." },
];

export default function NotificationSettingsClient() {
  const [prefs, setPrefs] = useState<Record<string, PrefRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/notifications/preferences");
        if (!res.ok) throw new Error("Could not load preferences.");
        const data = (await res.json()) as { preferences: PrefRow[] };
        const map: Record<string, PrefRow> = {};
        for (const p of data.preferences) map[p.type] = p;
        setPrefs(map);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggle(type: string, channel: "inApp" | "email", next: boolean) {
    const prev = prefs[type] ?? { type, inApp: true, email: true };
    setPrefs((p) => ({ ...p, [type]: { ...prev, [channel]: next } }));
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, [channel]: next }),
      });
      if (!res.ok) throw new Error("Save failed.");
    } catch (err) {
      // Revert on failure.
      setPrefs((p) => ({ ...p, [type]: prev }));
      setError(err instanceof Error ? err.message : "Save failed.");
      setTimeout(() => setError(null), 3000);
    }
  }

  if (loading) return <p className="text-sm text-white/40">Loading…</p>;

  return (
    <div>
      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/8 bg-[#141414]">
        <div className="hidden border-b border-white/8 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white/35 sm:flex sm:items-center">
          <span className="flex-1">Notification</span>
          <span className="w-20 text-center">In-app</span>
          <span className="w-20 text-center">Email</span>
        </div>
        <ul>
          {TYPES.map((t) => {
            const row = prefs[t.type] ?? { type: t.type, inApp: true, email: true };
            return (
              <li key={t.type} className="flex flex-col border-b border-white/5 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white/85">{t.label}</p>
                  <p className="mt-0.5 text-xs text-white/45">{t.description}</p>
                </div>
                <div className="mt-3 flex gap-4 sm:mt-0">
                  <ToggleCell
                    label={`In-app · ${t.label}`}
                    on={row.inApp}
                    onChange={(v) => toggle(t.type, "inApp", v)}
                  />
                  <ToggleCell
                    label={`Email · ${t.label}`}
                    on={row.email}
                    onChange={(v) => toggle(t.type, "email", v)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ToggleCell({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-12 flex-shrink-0 rounded-full transition ${
        on ? "bg-brand-500" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
