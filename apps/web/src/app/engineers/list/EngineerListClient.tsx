"use client";

import { useState } from "react";
import Link from "next/link";

type Profile = {
  id: string;
  tagline: string | null;
  bio: string | null;
  specialties: string[];
  gearChain: string | null;
  maxSampleRate: number;
  lufsTargets: number[];
  turnaroundHours: number;
  sampleWorkUrls: string[];
  isAcceptingWork: boolean;
  verifiedAt: string | null;
};

type Listing = {
  id: string;
  kind: string;
  title: string;
  priceUsd: number;
  sessionMinutes: number;
  deliveryDays: number;
  status: string;
};

const SPECIALTY_SUGGESTIONS = [
  "trap",
  "hip-hop",
  "rock",
  "pop",
  "r&b",
  "country",
  "electronic",
  "lo-fi",
  "vocal tuning",
  "stem mixing",
  "mastering",
  "atmos",
];

export default function EngineerListClient({
  initialProfile,
  initialListings,
  connectReady,
  proTier,
}: {
  initialProfile: Profile | null;
  initialListings: Listing[];
  connectReady: boolean;
  proTier: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [tagline, setTagline] = useState(initialProfile?.tagline ?? "");
  const [bio, setBio] = useState(initialProfile?.bio ?? "");
  const [specialties, setSpecialties] = useState<string[]>(
    initialProfile?.specialties ?? [],
  );
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [gearChain, setGearChain] = useState(initialProfile?.gearChain ?? "");
  const [maxSampleRate, setMaxSampleRate] = useState(
    initialProfile?.maxSampleRate ?? 48000,
  );
  const [turnaroundHours, setTurnaroundHours] = useState(
    initialProfile?.turnaroundHours ?? 48,
  );
  const [lufsTargets, setLufsTargets] = useState<number[]>(
    initialProfile?.lufsTargets ?? [-14, -9],
  );
  const [sampleWorkUrls, setSampleWorkUrls] = useState<string[]>(
    initialProfile?.sampleWorkUrls ?? [],
  );
  const [sampleUrlDraft, setSampleUrlDraft] = useState("");
  const [isAcceptingWork, setIsAcceptingWork] = useState(
    initialProfile?.isAcceptingWork ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const verified = !!profile?.verifiedAt;

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/engineers/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagline: tagline.trim() || null,
          bio: bio.trim() || null,
          specialties,
          gearChain: gearChain.trim() || null,
          maxSampleRate,
          lufsTargets,
          turnaroundHours,
          sampleWorkUrls,
          isAcceptingWork,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        profile?: Profile;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Failed to save");
      } else if (j.profile) {
        setProfile({
          ...j.profile,
          verifiedAt:
            typeof (j.profile as unknown as { verifiedAt?: unknown })
              .verifiedAt === "string"
              ? ((j.profile as unknown as { verifiedAt: string }).verifiedAt)
              : null,
        });
        setSuccess(
          verified
            ? "Saved."
            : "Saved. An admin will verify your profile within 48h before your engineer listings go live.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function addSpecialty(s: string) {
    const v = s.trim().toLowerCase();
    if (!v) return;
    if (specialties.includes(v)) return;
    if (specialties.length >= 12) return;
    setSpecialties([...specialties, v]);
    setSpecialtyDraft("");
  }

  function addSampleUrl(url: string) {
    const v = url.trim();
    if (!v) return;
    try {
      new URL(v);
    } catch {
      setError("Sample work URL must be a valid URL.");
      return;
    }
    if (sampleWorkUrls.length >= 6) return;
    setSampleWorkUrls([...sampleWorkUrls, v]);
    setSampleUrlDraft("");
  }

  return (
    <div className="space-y-8 text-white">
      <header>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300">
          Engineer Mode · Onboarding
        </p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
          List your mixing &amp; mastering services
        </h1>
        <p className="mt-2 max-w-2xl text-white/60">
          Verified engineers earn through escrow-protected 1-hour live sessions
          and async mastering deliveries. We confirm verification within 48
          hours.
        </p>
      </header>

      {/* Gating warnings */}
      {!proTier && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          You&apos;ll need a PRO subscription before you can publish engineer
          listings.{" "}
          <Link href="/pricing" className="underline">
            Upgrade →
          </Link>
        </div>
      )}
      {!connectReady && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Finish Stripe Connect onboarding so we can pay you when sessions
          complete.{" "}
          <Link href="/dashboard/payouts" className="underline">
            Set up payouts →
          </Link>
        </div>
      )}

      {/* Verification status banner */}
      <div
        className={`rounded-xl border p-4 text-sm ${
          verified
            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
            : profile
              ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
              : "border-white/10 bg-black/40 text-white/65"
        }`}
      >
        {verified ? (
          <>
            <strong>Verified Engineer ✓</strong> — your ENGINEER_MIX and
            ENGINEER_MASTER listings publish live to /engineers immediately.
          </>
        ) : profile ? (
          <>
            <strong>Pending verification</strong> — an admin reviews your
            portfolio + Stripe Connect status, usually within 48h. Save edits
            below in the meantime.
          </>
        ) : (
          <>
            <strong>Step 1 of 2:</strong> save your profile below. Step 2 is
            admin verification (we email you).
          </>
        )}
      </div>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
        <h2 className="text-lg font-extrabold">Profile</h2>

        <label className="block text-sm">
          <span className="text-white/70">
            Tagline · one-line pitch (max 160)
          </span>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, 160))}
            placeholder="Trap mix engineer · 10 years · -14 LUFS specialist"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-white/70">
            Bio · the long story (max 4000)
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 4000))}
            rows={5}
            placeholder="Credits, what you specialize in, what your room sounds like, who you'd love to work with."
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
          />
        </label>

        <div>
          <p className="text-sm text-white/70">Specialties</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {specialties.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpecialties(specialties.filter((x) => x !== s))}
                className="rounded-full border border-cyan-400/40 bg-cyan-500/20 px-3 py-1 text-xs font-bold text-cyan-100"
              >
                {s} ×
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={specialtyDraft}
              onChange={(e) => setSpecialtyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSpecialty(specialtyDraft);
                }
              }}
              placeholder="Add specialty + Enter"
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => addSpecialty(specialtyDraft)}
              className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white/10"
            >
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {SPECIALTY_SUGGESTIONS.filter((s) => !specialties.includes(s)).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addSpecialty(s)}
                  className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-white/55 hover:border-cyan-400/40 hover:text-cyan-200"
                >
                  + {s}
                </button>
              ),
            )}
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-white/70">
            Gear chain · plugins, hardware, monitors
          </span>
          <textarea
            value={gearChain}
            onChange={(e) => setGearChain(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Pro Tools Ultimate · Apollo X8 · Genelec 8351 · UAD Studer A800 · FabFilter Pro-Q3 · Soothe2 …"
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-white/70">Max sample rate</span>
            <select
              value={maxSampleRate}
              onChange={(e) => setMaxSampleRate(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
            >
              <option value={44100}>44.1 kHz</option>
              <option value={48000}>48 kHz</option>
              <option value={88200}>88.2 kHz</option>
              <option value={96000}>96 kHz</option>
              <option value={192000}>192 kHz</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Turnaround (hours)</span>
            <input
              type="number"
              min={1}
              max={720}
              value={turnaroundHours}
              onChange={(e) =>
                setTurnaroundHours(
                  Math.max(1, Math.min(720, parseInt(e.target.value, 10) || 48)),
                )
              }
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={isAcceptingWork}
              onChange={(e) => setIsAcceptingWork(e.target.checked)}
              className="h-5 w-5 accent-cyan-400"
            />
            <span className="text-white/70">Accepting new work</span>
          </label>
        </div>

        <div>
          <p className="text-sm text-white/70">LUFS targets you can hit</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[-14, -12, -9, -7].map((db) => (
              <button
                key={db}
                type="button"
                onClick={() =>
                  setLufsTargets(
                    lufsTargets.includes(db)
                      ? lufsTargets.filter((x) => x !== db)
                      : [...lufsTargets, db],
                  )
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  lufsTargets.includes(db)
                    ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100"
                    : "border-white/15 bg-black/40 text-white/65"
                }`}
              >
                {db} LUFS
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-white/70">Sample work · up to 6 URLs</p>
          <div className="mt-2 space-y-1">
            {sampleWorkUrls.map((u) => (
              <div
                key={u}
                className="flex items-center justify-between rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-xs"
              >
                <a
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-cyan-300 underline"
                >
                  {u}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setSampleWorkUrls(sampleWorkUrls.filter((x) => x !== u))
                  }
                  className="ml-3 text-white/40 hover:text-red-300"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          {sampleWorkUrls.length < 6 && (
            <div className="mt-2 flex gap-2">
              <input
                value={sampleUrlDraft}
                onChange={(e) => setSampleUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSampleUrl(sampleUrlDraft);
                  }
                }}
                placeholder="https://example.com/your-before-after.mp3"
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => addSampleUrl(sampleUrlDraft)}
                className="rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white/10"
              >
                Add
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {success}
          </p>
        )}

        <button
          type="button"
          onClick={saveProfile}
          disabled={saving}
          className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black uppercase tracking-widest text-black hover:bg-cyan-400 disabled:opacity-40"
        >
          {saving ? "Saving…" : profile ? "Update profile" : "Save profile"}
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-extrabold">Your engineer listings</h2>
          <Link
            href="/market/list"
            className="text-xs font-bold uppercase tracking-widest text-cyan-300 hover:underline"
          >
            + Add listing
          </Link>
        </div>
        {initialListings.length === 0 ? (
          <p className="text-sm text-white/55">
            No listings yet. Once verified, head to{" "}
            <Link href="/market/list" className="text-cyan-300 underline">
              /market/list
            </Link>{" "}
            and pick <strong>ENGINEER_MIX</strong> or{" "}
            <strong>ENGINEER_MASTER</strong> as the kind.
          </p>
        ) : (
          <ul className="space-y-2">
            {initialListings.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                      l.kind === "ENGINEER_MIX"
                        ? "bg-cyan-500/20 text-cyan-200"
                        : "bg-violet-500/20 text-violet-200"
                    }`}
                  >
                    {l.kind === "ENGINEER_MIX" ? "Mix" : "Master"}
                  </span>
                  <span className="truncate">{l.title}</span>
                  <span className="ml-2 text-[10px] text-white/40">
                    {l.status}
                  </span>
                </span>
                <span className="font-black tabular-nums">
                  ${l.priceUsd.toFixed(0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
