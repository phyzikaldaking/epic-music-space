"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { uploadImage, ClientUploadError } from "@/lib/clientImageUpload";
import type { EngineerCredit, EngineerAccolade, EngineerGear, AccoladeKind } from "@/lib/proProfile";
import { ACCOLADE_BADGE } from "@/lib/proProfile";

interface InitialState {
  headline: string;
  bioLong: string;
  coverImage: string;
  location: string;
  websiteUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  youtubeUrl: string;
  tiktokUrl: string;
  spotifyUrl: string;
  grammyNominations: number;
  grammyWins: number;
  riaaPlatinum: number;
  riaaGold: number;
  billboardNumberOne: number;
  yearsExperience: number | null;
  proProfilePublished: boolean;
  engineerCredits: EngineerCredit[];
  engineerAccolades: EngineerAccolade[];
  engineerGear: EngineerGear;
}

export default function ProProfileEditor({
  username,
  role,
  initial,
}: {
  username: string;
  role: string;
  initial: InitialState;
}) {
  const router = useRouter();
  const [s, setS] = useState<InitialState>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const setField = <K extends keyof InitialState>(k: K, v: InitialState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    setOk(false);

    const body: Record<string, unknown> = {
      headline: s.headline.trim() || null,
      bioLong: s.bioLong.trim() || null,
      coverImage: s.coverImage.trim() || null,
      location: s.location.trim() || null,
      websiteUrl: s.websiteUrl.trim() || null,
      instagramUrl: s.instagramUrl.trim() || null,
      twitterUrl: s.twitterUrl.trim() || null,
      youtubeUrl: s.youtubeUrl.trim() || null,
      tiktokUrl: s.tiktokUrl.trim() || null,
      spotifyUrl: s.spotifyUrl.trim() || null,
      grammyNominations: s.grammyNominations,
      grammyWins: s.grammyWins,
      riaaPlatinum: s.riaaPlatinum,
      riaaGold: s.riaaGold,
      billboardNumberOne: s.billboardNumberOne,
      yearsExperience: s.yearsExperience ?? null,
      proProfilePublished: s.proProfilePublished,
      engineerCredits: s.engineerCredits,
      engineerAccolades: s.engineerAccolades,
      engineerGear: s.engineerGear,
    };

    try {
      const res = await fetch("/api/user/pro-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Failed to save.");
        setSaving(false);
        return;
      }
      setOk(true);
      setTimeout(() => {
        if (username) router.push(`/pro/${username}`);
        else router.refresh();
      }, 800);
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCoverFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    setErr("");
    try {
      const result = await uploadImage(file, { kind: "cover" });
      setField("coverImage", result.publicUrl);
    } catch (err) {
      setErr(err instanceof ClientUploadError ? err.message : "Cover upload failed.");
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href={username ? `/pro/${username}` : "/dashboard"} className="text-sm text-white/45 hover:text-white">
        ← Back to profile
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">
        Edit your <span className="text-gradient-ems">pro profile</span>
      </h1>
      <p className="mt-2 text-sm text-white/55">
        This is the page artists see when they&apos;re choosing who to hire. Treat it like
        an EPK — accolades and credits matter most.
      </p>

      {err && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}
      {ok && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          ✅ Saved.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        {/* ── Cover banner ─────────────────────────── */}
        <Section title="Cover banner" hint="Wide cinematic photo behind your avatar. Studio shot, behind-the-scenes, on-stage — anything that reads grand.">
          <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-brand-900/40 to-accent-900/30">
            {s.coverImage ? (
              <Image src={s.coverImage} alt="" fill sizes="100vw" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-white/40">
                No cover yet
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10">
              {coverUploading ? "Uploading…" : "Upload cover"}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverFile} disabled={coverUploading} />
            </label>
            {s.coverImage && (
              <button
                type="button"
                onClick={() => setField("coverImage", "")}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/55 hover:text-white"
              >
                Remove
              </button>
            )}
          </div>
        </Section>

        {/* ── Headline + Bio + Location ─────────────── */}
        <Section title="Headline & Bio">
          <Field label="Headline (one line — what you want artists to remember)" hint="Example: “Grammy-nominated mix engineer for SZA, Doja Cat, J. Cole.”">
            <input
              type="text"
              value={s.headline}
              maxLength={160}
              onChange={(e) => setField("headline", e.target.value)}
              placeholder="Multi-Platinum mix engineer based in Atlanta"
              className={inputClass}
            />
          </Field>
          <Field label={`About (${s.bioLong.length}/2000)`} hint="Tell artists who you are and how you work. The full story.">
            <textarea
              value={s.bioLong}
              maxLength={2000}
              rows={6}
              onChange={(e) => setField("bioLong", e.target.value)}
              className={`${inputClass} resize-y font-normal`}
              placeholder="I started mixing on a borrowed laptop in 2012… "
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location">
              <input
                type="text"
                value={s.location}
                maxLength={120}
                onChange={(e) => setField("location", e.target.value)}
                placeholder="Atlanta, GA"
                className={inputClass}
              />
            </Field>
            <Field label="Years of experience">
              <input
                type="number"
                min={0}
                max={80}
                value={s.yearsExperience ?? ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? null : Number(e.target.value);
                  setField("yearsExperience", Number.isFinite(n as number) ? (n as number) : null);
                }}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        {/* ── Accolade counters ─────────────────────── */}
        <Section title="Accolades" hint="The marquee numbers shown front and center. Be honest — these get verified eventually.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Counter label="Grammy Wins"        emoji="🏆" value={s.grammyWins}         onChange={(v) => setField("grammyWins", v)} max={99} />
            <Counter label="Grammy Nominations" emoji="🎼" value={s.grammyNominations}  onChange={(v) => setField("grammyNominations", v)} max={99} />
            <Counter label="Billboard #1s"      emoji="📈" value={s.billboardNumberOne} onChange={(v) => setField("billboardNumberOne", v)} max={99} />
            <Counter label="RIAA Platinum"      emoji="💿" value={s.riaaPlatinum}       onChange={(v) => setField("riaaPlatinum", v)} max={999} />
            <Counter label="RIAA Gold"          emoji="🥇" value={s.riaaGold}           onChange={(v) => setField("riaaGold", v)} max={999} />
          </div>
        </Section>

        {/* ── Selected credits ──────────────────────── */}
        <Section title="Selected credits" hint="Records you've worked on. Up to 50.">
          <CreditsEditor
            credits={s.engineerCredits}
            onChange={(next) => setField("engineerCredits", next)}
          />
        </Section>

        {/* ── Awards list ───────────────────────────── */}
        <Section title="Awards & recognition" hint="Specific awards beyond the counters. Up to 30.">
          <AccoladesEditor
            accolades={s.engineerAccolades}
            onChange={(next) => setField("engineerAccolades", next)}
          />
        </Section>

        {/* ── Gear ─────────────────────────────────── */}
        {(role === "ENGINEER" || role === "PRODUCER") && (
          <Section title="Studio & gear" hint="Pro context — what you mix on, what you record into.">
            <GearEditor
              gear={s.engineerGear}
              onChange={(next) => setField("engineerGear", next)}
            />
          </Section>
        )}

        {/* ── Social links ─────────────────────────── */}
        <Section title="Connect">
          <div className="grid gap-3 sm:grid-cols-2">
            <UrlField label="Website"   value={s.websiteUrl}   onChange={(v) => setField("websiteUrl", v)} placeholder="https://yourstudio.com" />
            <UrlField label="Instagram" value={s.instagramUrl} onChange={(v) => setField("instagramUrl", v)} placeholder="https://instagram.com/handle" />
            <UrlField label="Twitter / X" value={s.twitterUrl} onChange={(v) => setField("twitterUrl", v)} placeholder="https://x.com/handle" />
            <UrlField label="YouTube"   value={s.youtubeUrl}   onChange={(v) => setField("youtubeUrl", v)} placeholder="https://youtube.com/@handle" />
            <UrlField label="TikTok"    value={s.tiktokUrl}    onChange={(v) => setField("tiktokUrl", v)} placeholder="https://tiktok.com/@handle" />
            <UrlField label="Spotify"   value={s.spotifyUrl}   onChange={(v) => setField("spotifyUrl", v)} placeholder="https://open.spotify.com/artist/…" />
          </div>
        </Section>

        {/* ── Publish toggle + save ────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/3 p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={s.proProfilePublished}
              onChange={(e) => setField("proProfilePublished", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-500"
            />
            <span>
              <span className="block text-sm font-bold">Publish my pro profile</span>
              <span className="block text-xs text-white/55">
                When on, your profile is the featured one shown to artists looking
                to hire you. Turn off to revert to the basic listing view.
              </span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 py-3 text-base font-extrabold text-white shadow-lg shadow-brand-500/30 hover:from-brand-400 hover:to-accent-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-brand-500/50";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-widest text-white/65">{title}</h2>
      {hint && <p className="mt-1 text-xs text-white/45">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/45">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

function UrlField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input type="url" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </Field>
  );
}

function Counter({ label, emoji, value, onChange, max }: { label: string; emoji: string; value: number; onChange: (n: number) => void; max: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">{emoji}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/55">{label}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-8 w-8 rounded-lg border border-white/15 bg-white/5 text-base font-bold hover:bg-white/10">−</button>
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : 0);
          }}
          className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-center text-base font-extrabold"
        />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} className="h-8 w-8 rounded-lg border border-white/15 bg-white/5 text-base font-bold hover:bg-white/10">+</button>
      </div>
    </div>
  );
}

function CreditsEditor({ credits, onChange }: { credits: EngineerCredit[]; onChange: (next: EngineerCredit[]) => void }) {
  const blank: EngineerCredit = { artist: "", title: "", role: "Mix Engineer", year: null };
  const update = (idx: number, patch: Partial<EngineerCredit>) => {
    const next = credits.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    onChange(next);
  };
  const remove = (idx: number) => onChange(credits.filter((_, i) => i !== idx));
  const add = () => onChange([...credits, blank].slice(0, 50));
  return (
    <div className="space-y-3">
      {credits.map((c, idx) => (
        <div key={idx} className="rounded-xl border border-white/10 bg-white/3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={inputClass} placeholder="Artist (e.g., SZA)"      value={c.artist} onChange={(e) => update(idx, { artist: e.target.value })} />
            <input className={inputClass} placeholder="Title (e.g., Saturn)"   value={c.title}  onChange={(e) => update(idx, { title: e.target.value })} />
            <input className={inputClass} placeholder="Role (Mix / Master / Producer / …)" value={c.role} onChange={(e) => update(idx, { role: e.target.value })} />
            <input className={inputClass} type="number" placeholder="Year (e.g., 2024)" value={c.year ?? ""} onChange={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              update(idx, { year: Number.isFinite(n as number) ? (n as number) : null });
            }} />
            <input className={inputClass} placeholder="Cover URL (optional)"     value={c.coverUrl ?? ""}  onChange={(e) => update(idx, { coverUrl: e.target.value })} />
            <input className={inputClass} placeholder="Spotify link (optional)"  value={c.spotifyUrl ?? ""} onChange={(e) => update(idx, { spotifyUrl: e.target.value })} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <CreditFlag label="🏆 Grammy win"  on={!!c.isGrammyWin}        onChange={(v) => update(idx, { isGrammyWin: v })} />
            <CreditFlag label="🎼 Grammy nom"  on={!!c.isGrammyNominated}  onChange={(v) => update(idx, { isGrammyNominated: v })} />
            <CreditFlag label="💿 Platinum"    on={!!c.isPlatinum}         onChange={(v) => update(idx, { isPlatinum: v })} />
            <CreditFlag label="🥇 Gold"        on={!!c.isGold}             onChange={(v) => update(idx, { isGold: v })} />
            <CreditFlag label="📈 Billboard #1" on={!!c.isBillboardNumberOne} onChange={(v) => update(idx, { isBillboardNumberOne: v })} />
            <button type="button" onClick={() => remove(idx)} className="ml-auto rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/15">
              Remove
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} disabled={credits.length >= 50} className="w-full rounded-xl border border-dashed border-white/15 bg-white/3 py-3 text-sm font-semibold text-white/55 hover:bg-white/5 disabled:opacity-40">
        + Add credit ({credits.length}/50)
      </button>
    </div>
  );
}

function CreditFlag({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
        on
          ? "border-amber-400/50 bg-amber-400/15 text-amber-100"
          : "border-white/10 bg-white/3 text-white/45 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

const ACCOLADE_KIND_OPTIONS: { value: AccoladeKind; label: string }[] = [
  { value: "grammy-win",        label: "Grammy Win" },
  { value: "grammy-nomination", label: "Grammy Nomination" },
  { value: "riaa-platinum",     label: "RIAA Platinum" },
  { value: "riaa-gold",         label: "RIAA Gold" },
  { value: "billboard-no1",     label: "Billboard #1" },
  { value: "ama",               label: "AMA" },
  { value: "bet",               label: "BET" },
  { value: "iheart",            label: "iHeart Radio" },
  { value: "other",             label: "Other" },
];

function AccoladesEditor({ accolades, onChange }: { accolades: EngineerAccolade[]; onChange: (next: EngineerAccolade[]) => void }) {
  const blank: EngineerAccolade = { title: "", kind: "other", year: null, org: "" };
  const update = (idx: number, patch: Partial<EngineerAccolade>) => {
    const next = accolades.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange(next);
  };
  const remove = (idx: number) => onChange(accolades.filter((_, i) => i !== idx));
  const add = () => onChange([...accolades, blank].slice(0, 30));
  return (
    <div className="space-y-3">
      {accolades.map((a, idx) => {
        const meta = ACCOLADE_BADGE[a.kind];
        return (
          <div key={idx} className={`rounded-xl border bg-gradient-to-r ${meta.tint} p-3`}>
            <div className="grid gap-2 sm:grid-cols-[1fr_180px_120px_auto]">
              <input className={`${inputClass} bg-black/40`} placeholder="Title (e.g., Best Engineered Album)" value={a.title} onChange={(e) => update(idx, { title: e.target.value })} />
              <select
                value={a.kind}
                onChange={(e) => update(idx, { kind: e.target.value as AccoladeKind })}
                className={`${inputClass} bg-black/40`}
              >
                {ACCOLADE_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input className={`${inputClass} bg-black/40`} type="number" placeholder="Year" value={a.year ?? ""} onChange={(e) => {
                const n = e.target.value === "" ? null : Number(e.target.value);
                update(idx, { year: Number.isFinite(n as number) ? (n as number) : null });
              }} />
              <button type="button" onClick={() => remove(idx)} className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-red-500/15">
                ×
              </button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={add} disabled={accolades.length >= 30} className="w-full rounded-xl border border-dashed border-white/15 bg-white/3 py-3 text-sm font-semibold text-white/55 hover:bg-white/5 disabled:opacity-40">
        + Add accolade ({accolades.length}/30)
      </button>
    </div>
  );
}

function GearEditor({ gear, onChange }: { gear: EngineerGear; onChange: (next: EngineerGear) => void }) {
  const setKey = <K extends keyof EngineerGear>(k: K, v: EngineerGear[K]) =>
    onChange({ ...gear, [k]: v });
  const setList = (k: "daws" | "plugins" | "outboard", csv: string) => {
    const items = csv.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30);
    onChange({ ...gear, [k]: items });
  };
  const csv = (arr?: string[]) => (arr ?? []).join(", ");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Console (e.g., SSL 4000 G+)">
        <input className={inputClass} value={gear.console ?? ""} onChange={(e) => setKey("console", e.target.value)} />
      </Field>
      <Field label="Monitors (e.g., ATC SCM45A)">
        <input className={inputClass} value={gear.monitors ?? ""} onChange={(e) => setKey("monitors", e.target.value)} />
      </Field>
      <Field label="DAWs (comma-separated)">
        <input className={inputClass} value={csv(gear.daws)} onChange={(e) => setList("daws", e.target.value)} />
      </Field>
      <Field label="Plugins (comma-separated)">
        <input className={inputClass} value={csv(gear.plugins)} onChange={(e) => setList("plugins", e.target.value)} />
      </Field>
      <Field label="Outboard (comma-separated)">
        <input className={inputClass} value={csv(gear.outboard)} onChange={(e) => setList("outboard", e.target.value)} />
      </Field>
      <Field label="Room treatment">
        <input className={inputClass} value={gear.roomTreatment ?? ""} onChange={(e) => setKey("roomTreatment", e.target.value)} />
      </Field>
    </div>
  );
}
