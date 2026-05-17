"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CREATOR_ROLES = [
  {
    value: "ARTIST",
    label: "Artist",
    body: "Release songs, build your fan profile, sell licenses, and receive payouts.",
  },
  {
    value: "PRODUCER",
    label: "Producer",
    body: "Show your beats, services, credits, and production identity.",
  },
  {
    value: "ENGINEER",
    label: "Engineer",
    body: "Offer mixing, mastering, recording, and studio services.",
  },
  {
    value: "LABEL",
    label: "Label",
    body: "Manage releases, catalog activity, artist profiles, and revenue workflows.",
  },
] as const;

type CreatorRole = (typeof CREATOR_ROLES)[number]["value"];

function normalizeUsername(value: string) {
  return value.replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
}

export default function CreatorOnboardingClient() {
  const router = useRouter();
  const [role, setRole] = useState<CreatorRole>("ARTIST");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const cleanUsername = normalizeUsername(username);
    if (cleanUsername.length < 3) {
      setError("Choose a studio username with at least 3 characters.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/user/creator-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, username: cleanUsername, bio }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not activate creator profile.");
        return;
      }
      router.push("/dashboard/payouts?creator=activated");
      router.refresh();
    } catch {
      setError("Could not activate creator profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[28px] border border-white/10 bg-[#0b0d13] p-5 shadow-2xl shadow-black/35 sm:p-8">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200/75">Step 1</p>
        <h2 className="mt-2 text-2xl font-black text-white">Choose your creator profile</h2>
        <p className="mt-2 text-sm leading-6 text-white/55">
          This unlocks your public artist profile, upload tools, marketplace selling, and payout setup.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {CREATOR_ROLES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setRole(item.value)}
            className={`rounded-2xl border p-4 text-left transition ${
              role === item.value
                ? "border-cyan-300/55 bg-cyan-300/12 shadow-lg shadow-cyan-300/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <p className="text-sm font-black uppercase tracking-[0.18em] text-white">{item.label}</p>
            <p className="mt-2 text-xs leading-5 text-white/55">{item.body}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5">
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-white/45">
            Studio username
          </label>
          <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-black/35 focus-within:border-cyan-300/50">
            <span className="grid place-items-center border-r border-white/10 px-4 text-sm font-bold text-white/35">@</span>
            <input
              value={username}
              onChange={(event) => setUsername(normalizeUsername(event.target.value))}
              placeholder="yourname"
              className="min-h-12 flex-1 bg-transparent px-4 text-sm font-semibold text-white outline-none placeholder:text-white/25"
            />
          </div>
          <p className="mt-2 text-xs text-white/35">This becomes your public profile URL.</p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-white/45">
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value.slice(0, 256))}
            rows={4}
            placeholder="Tell fans what you make, where you are from, and what your sound feels like."
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50"
          />
          <p className="mt-2 text-right text-xs text-white/35">{bio.length}/256</p>
        </div>
      </div>

      {error && <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-white/42">
          After activation, you will go straight to payout setup so you can connect Stripe and get paid.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#061013] transition hover:bg-cyan-200 disabled:opacity-50"
        >
          {saving ? "Activating..." : "Activate creator profile"}
        </button>
      </div>
    </form>
  );
}
