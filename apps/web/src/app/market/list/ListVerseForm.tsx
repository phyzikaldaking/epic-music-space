"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  previewSongs: Array<{ id: string; title: string }>;
};

export default function ListVerseForm({ previewSongs }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<"LIVE_SESSION" | "ASYNC_DELIVERY">("LIVE_SESSION");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsd, setPriceUsd] = useState(250);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [deliveryDays, setDeliveryDays] = useState(3);
  const [tags, setTags] = useState("");
  const [previewSongId, setPreviewSongId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/market/verses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind,
          title: title.trim(),
          description: description.trim() || undefined,
          priceUsd,
          sessionMinutes: kind === "LIVE_SESSION" ? sessionMinutes : undefined,
          deliveryDays: kind === "ASYNC_DELIVERY" ? deliveryDays : undefined,
          previewSongId: previewSongId || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 8),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Listing failed.");
        setBusy(false);
        return;
      }
      const data = (await res.json()) as { listing?: { id: string } };
      if (data.listing?.id) {
        router.push(`/market/verses/${data.listing.id}`);
      }
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setKind("LIVE_SESSION")}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            kind === "LIVE_SESSION"
              ? "border-amber-400 bg-amber-400/20"
              : "border-white/15 bg-white/[0.03] hover:bg-white/[0.08]"
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-200">
            Live session
          </div>
          <div className="mt-1 text-xs font-bold">Joint studio room, calendar slot</div>
        </button>
        <button
          type="button"
          onClick={() => setKind("ASYNC_DELIVERY")}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            kind === "ASYNC_DELIVERY"
              ? "border-amber-400 bg-amber-400/20"
              : "border-white/15 bg-white/[0.03] hover:bg-white/[0.08]"
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-200">
            Async delivery
          </div>
          <div className="mt-1 text-xs font-bold">Record on your time, deliver WAV</div>
        </button>
      </div>

      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 120))}
          placeholder="16-bar verse · trap / drill"
          required
          className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          rows={4}
          placeholder="What you bring to the booth — style, references, what kind of session this is."
          className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Price (USD)">
          <input
            type="number"
            min={5}
            max={50000}
            value={priceUsd}
            onChange={(e) => setPriceUsd(Math.max(5, parseInt(e.target.value) || 0))}
            className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-right text-sm outline-none focus:border-amber-400"
          />
        </Field>
        {kind === "LIVE_SESSION" ? (
          <Field label="Session length (min)">
            <select
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(parseInt(e.target.value))}
              className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
            >
              {[30, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Delivery (days)">
            <select
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(parseInt(e.target.value))}
              className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
            >
              {[1, 2, 3, 5, 7, 14].map((d) => (
                <option key={d} value={d}>
                  {d} day{d === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Tags (comma-separated)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="trap, hook, feature, melodic"
          className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
        />
      </Field>
      <Field label="Preview track (optional)">
        <select
          value={previewSongId}
          onChange={(e) => setPreviewSongId(e.target.value)}
          className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
        >
          <option value="">— No preview —</option>
          {previewSongs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </Field>

      {error && (
        <p className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || title.trim().length < 3}
        className="w-full rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-amber-300 disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish listing"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-white/55">
        {label}
      </div>
      {children}
    </label>
  );
}
