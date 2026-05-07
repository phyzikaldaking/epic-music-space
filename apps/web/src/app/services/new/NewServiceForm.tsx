"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceListingKind, Role } from "@ems/db";
import { SERVICE_KIND_META } from "@/lib/serviceListings";

interface Props {
  allowedKinds: ServiceListingKind[];
  role: Role;
}

export default function NewServiceForm({ allowedKinds, role }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<ServiceListingKind>(allowedKinds[0]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsd, setPriceUsd] = useState("75");
  const [deliveryDays, setDeliveryDays] = useState("7");
  const [exampleAudioUrl, setExampleAudioUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bestFor, setBestFor] = useState("");
  const [revisionsIncluded, setRevisionsIncluded] = useState("2");
  const [deliveryFormat, setDeliveryFormat] = useState("24-bit WAV + MP3 reference");
  const [offersRush, setOffersRush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const meta = SERVICE_KIND_META[kind];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const baseDescription = description.trim();
    const engineeredDescription =
      role === "ENGINEER"
        ? [
            baseDescription,
            "",
            "Service details:",
            bestFor.trim() ? `- Best for: ${bestFor.trim()}` : null,
            `- Revisions included: ${revisionsIncluded.trim() || "2"}`,
            `- Delivery format: ${deliveryFormat.trim() || "24-bit WAV + MP3 reference"}`,
            `- Rush option: ${offersRush ? "Available on request" : "Not included"}`,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n")
        : baseDescription;
    const res = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        title: title.trim(),
        description: engineeredDescription,
        priceUsd: Number(priceUsd),
        deliveryDays: Number(deliveryDays),
        exampleAudioUrl: exampleAudioUrl.trim() || undefined,
        downloadUrl: meta.isInstant ? (downloadUrl.trim() || undefined) : undefined,
        coverUrl: coverUrl.trim() || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.id) {
      setErr(data.error ?? "Couldn't create listing.");
      return;
    }
    router.push(`/services/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-brand-300">
          {role === "ENGINEER" ? "Engineer storefront" : role === "PRODUCER" ? "Producer storefront" : "New listing"}
        </p>
        <h1 className="text-3xl font-extrabold">List a service</h1>
        <p className="mt-2 text-sm text-white/55">
          Buyers pay through Stripe or PayPal. Every sale is allocated 100% to you,
          minus a flat 10% platform fee that&apos;s itemized on every payout.
          Payouts batch weekly.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-white/45">Type</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {allowedKinds.map((k) => {
              const m = SERVICE_KIND_META[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition ${
                    kind === k
                      ? "border-brand-500/60 bg-brand-500/10"
                      : "border-white/10 bg-white/3 hover:bg-white/5"
                  }`}
                >
                  <span className="text-xl">{m.badge}</span>
                  <span className="text-xs font-semibold">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="title" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
            Title
          </label>
          <input
            id="title"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={meta.category === "engineer"
              ? "Pro mix — modern hip-hop / RnB · stems welcome"
              : "Detroit-style trap kit · 30 drums + 808s"}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/50"
          />
        </div>

        <div>
          <label htmlFor="desc" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
            Description
          </label>
          <textarea
            id="desc"
            required
            rows={6}
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell buyers what they get, your turnaround, references, anything that matters."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 outline-none focus:border-brand-500/50 resize-none"
          />
        </div>

        {role === "ENGINEER" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-brand-300">Engineer setup details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="best-for" className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-white/45">
                  Best for
                </label>
                <input
                  id="best-for"
                  value={bestFor}
                  onChange={(e) => setBestFor(e.target.value)}
                  placeholder="Trap vocals, pop mixes, podcast cleanup..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-brand-500/50"
                />
              </div>
              <div>
                <label htmlFor="revisions" className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-white/45">
                  Revisions included
                </label>
                <input
                  id="revisions"
                  type="number"
                  min={0}
                  max={10}
                  value={revisionsIncluded}
                  onChange={(e) => setRevisionsIncluded(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-brand-500/50"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="delivery-format" className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-white/45">
                  Delivery format
                </label>
                <input
                  id="delivery-format"
                  value={deliveryFormat}
                  onChange={(e) => setDeliveryFormat(e.target.value)}
                  placeholder="24-bit WAV, MP3 ref, stems on request..."
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-brand-500/50"
                />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-white/75">
                <input
                  type="checkbox"
                  checked={offersRush}
                  onChange={(e) => setOffersRush(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-black/30"
                />
                Offer rush delivery option
              </label>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="price" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
              Price (USD)
            </label>
            <input
              id="price"
              type="number"
              required
              min={1}
              max={10000}
              step={1}
              value={priceUsd}
              onChange={(e) => setPriceUsd(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
            />
          </div>
          {!meta.isInstant && (
            <div>
              <label htmlFor="days" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
                Delivery days
              </label>
              <input
                id="days"
                type="number"
                required
                min={1}
                max={60}
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
              />
            </div>
          )}
        </div>

        {meta.isInstant && (
          <div>
            <label htmlFor="dl" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
              Download URL <span className="text-white/30">(delivered after purchase)</span>
            </label>
            <input
              id="dl"
              type="url"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              placeholder="https://your-bucket.s3.amazonaws.com/kit.zip"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cover" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
              Cover image URL
            </label>
            <input
              id="cover"
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
            />
          </div>
          <div>
            <label htmlFor="ex" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-white/45">
              Sample audio URL
            </label>
            <input
              id="ex"
              type="url"
              value={exampleAudioUrl}
              onChange={(e) => setExampleAudioUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-brand-500/50"
            />
          </div>
        </div>

        {err && <p className="text-sm text-red-300">{err}</p>}

        <button
          type="submit"
          disabled={busy || !title.trim() || !description.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-4 text-base font-bold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Publishing..." : "Publish listing"}
        </button>
      </form>
    </div>
  );
}
