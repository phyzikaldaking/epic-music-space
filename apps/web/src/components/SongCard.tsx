"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { formatPrice } from "@ems/utils";
import PromoteSongButton from "@/components/PromoteSongButton";
import { usePlayer } from "@/contexts/PlayerContext";
import { getStreamUrl } from "@/lib/audioStream";
import { isEmbedSource, classifyAudioSource } from "@/lib/audioSource";

type PriceLike = string | number | { toString(): string };

type DominanceTier = "CROWN" | "ELITE" | "RISING" | "BOOSTED" | "OPEN";

interface SongCardProps {
  id: string;
  title: string;
  artist: string;
  genre?: string | null;
  coverUrl?: string | null;
  audioUrl?: string | null;
  licensePrice: PriceLike;
  revenueSharePct: PriceLike;
  soldLicenses: number;
  totalLicenses: number;
  bpm?: number | null;
  musicalKey?: string | null;
  /** Inferred descriptor like "Energetic" or "Chill" — see moodFor() in
   *  lib/songMood.ts. Renders as a metadata chip next to BPM/Key/Genre
   *  so sync buyers can scan vibe before clicking. */
  mood?: string | null;
  /** When true the card shows a "Buy Stems / Remix" affordance next to
   *  the standard license CTA. Stems are released via the existing
   *  trackout download on /track/[id] for license holders. */
  hasStems?: boolean;
  /** When set, renders a "Start Versus" CTA pointing to this URL.
   *  Caller decides eligibility (typically: viewer != artist, song has
   *  some traction). Honors EMS's battle-driven growth loop — invite
   *  → battle → share "WHO WON?" → more signups. */
  verzuzHref?: string;
  aiScore?: number;
  boostScore?: number;
  paidBoostApplied?: number;
  paidBoostCap?: number;
  paidBoostCapped?: boolean;
  paidInfluencePct?: number;
  rankingFactors?: {
    aiQuality: number;
    licenseDemand: number;
    streamVelocity: number;
    versusStrength: number;
    recency: number;
  };
  isTrending?: boolean;
  isBoosted?: boolean;
  rankPosition?: number;
  dominanceTier?: DominanceTier;
  placementLabel?: string | null;
  competitorGap?: number | null;
}

function displayPrice(value: PriceLike) {
  return formatPrice(typeof value === "number" || typeof value === "string" ? value : value.toString());
}

function getDominanceTier(rankPosition?: number, boostScore = 0, rankScore = 0): DominanceTier {
  if (rankPosition === 1) return "CROWN";
  if (rankPosition && rankPosition <= 3) return "ELITE";
  if (rankPosition && rankPosition <= 10) return "RISING";
  if (boostScore > 0 || rankScore >= 100) return "BOOSTED";
  return "OPEN";
}

function getTierLabel(tier: DominanceTier) {
  switch (tier) {
    case "CROWN":
      return "Crown Control";
    case "ELITE":
      return "Elite Screen";
    case "RISING":
      return "Rising Threat";
    case "BOOSTED":
      return "Paid Push";
    default:
      return "Open Slot";
  }
}

function getTierClass(tier: DominanceTier) {
  switch (tier) {
    case "CROWN":
      return "border-gold-300/55 shadow-gold-500/25";
    case "ELITE":
      return "border-cyan-200/45 shadow-cyan-500/18";
    case "RISING":
      return "border-accent-300/40 shadow-accent-500/14";
    case "BOOSTED":
      return "border-brand-300/35 shadow-brand-500/12";
    default:
      return "border-white/12 group-hover:border-accent-300/45 group-hover:shadow-accent-500/12";
  }
}

const visualizerBars = [34, 62, 44, 76, 52, 88, 41, 70, 95, 58, 47, 82, 38, 66, 51, 73, 46, 90];

export default function SongCard({ id, title, artist, genre, coverUrl, audioUrl, licensePrice, revenueSharePct, soldLicenses, totalLicenses, bpm, musicalKey, mood, hasStems = false, verzuzHref, aiScore, boostScore = 0, paidBoostApplied, paidBoostCap, paidBoostCapped = false, paidInfluencePct = 0, rankingFactors, isTrending = false, isBoosted = false, rankPosition, dominanceTier, placementLabel, competitorGap }: SongCardProps) {
  const remaining = Math.max(0, totalLicenses - soldLicenses);
  const remainingPct = totalLicenses > 0 ? Math.round((remaining / totalLicenses) * 100) : 0;
  const soldOutSoon = totalLicenses > 0 && remainingPct <= 20;
  const revenueShare = revenueSharePct.toString();
  const licenseLabel = displayPrice(licensePrice);
  const rankScore = Number(aiScore ?? 0) + Number(paidBoostApplied ?? boostScore ?? 0);
  const tier = dominanceTier ?? getDominanceTier(rankPosition, boostScore, rankScore);
  const isChampion = tier === "CROWN" || (rankScore > 0 && rankScore >= 250);
  const dominancePercent = Math.max(8, Math.min(100, Math.round(rankScore / 3)));

  const player = usePlayer();
  const isCurrent = player.currentSong?.id === id;
  const playing = isCurrent && player.isPlaying;
  const progress = isCurrent ? player.progress : 0;
  const energy = isCurrent && player.isPlaying ? Math.min(100, Math.round(player.progress * 0.9 + 12)) : 0;
  const audioError = false;
  const spectrum = useMemo(() => visualizerBars.map((bar) => bar * (playing ? 0.85 : 0.45)), [playing]);
  const [hovered, setHovered] = useState(false);

  const wallTilt = useMemo(() => {
    const seed = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return seed % 2 === 0 ? "md:rotate-y-[-5deg]" : "md:rotate-y-[5deg]";
  }, [id]);

  const embedSource = audioUrl ? classifyAudioSource(audioUrl) : null;
  const isEmbed = audioUrl ? isEmbedSource(audioUrl) : false;

  function handlePlayClick() {
    if (!audioUrl) return;
    // Embed-only sources (YouTube/Vimeo/SoundCloud/Spotify) cannot stream
    // through the global player — send the listener to the track page where
    // the embedded player lives.
    if (isEmbed) {
      if (typeof window !== "undefined") window.location.href = `/track/${id}`;
      return;
    }
    if (isCurrent) {
      player.togglePlay();
      return;
    }
    // Always stream through the same-origin proxy so the raw Supabase URL
    // never appears in the browser's network panel.
    player.playSong({ id, title, artist, audioUrl: getStreamUrl(id), coverUrl: coverUrl ?? null });
  }

  return (
    <article className={`group relative transform-gpu transition duration-500 [transform-style:preserve-3d] hover:z-20 hover:scale-[1.035] hover:rotate-y-0 ${wallTilt} ${playing ? "now-playing-ring z-10" : ""}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {(isChampion || rankPosition) && <div className={`absolute -top-5 left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] shadow-2xl ${isChampion ? "border-gold-300/40 bg-black text-gold-100 shadow-gold-500/20" : "border-cyan-300/30 bg-black text-cyan-100 shadow-cyan-500/10"}`}>{isChampion ? "Crowned Champion" : `Rank #${rankPosition}`}</div>}
      <div className={`absolute -inset-3 rounded-[2rem] bg-gradient-to-br blur-2xl transition duration-500 ${isChampion ? "from-gold-300/45 via-gold-500/24 to-accent-300/20 opacity-100" : tier === "ELITE" ? "from-cyan-300/34 via-brand-400/18 to-gold-300/12 opacity-90" : tier === "RISING" ? "from-accent-400/24 via-brand-500/18 to-transparent opacity-80" : "from-brand-500/0 via-accent-400/0 to-gold-300/0 opacity-0 group-hover:from-brand-500/28 group-hover:via-accent-400/18 group-hover:to-gold-300/18 group-hover:opacity-100"}`} style={{ opacity: playing ? Math.max(0.35, energy / 100) : undefined }} />
      <div className={`relative overflow-hidden rounded-[1.35rem] border bg-gradient-to-b from-zinc-800 via-[#101118] to-black p-2 shadow-2xl shadow-black/60 transition duration-500 ${getTierClass(tier)}`}>
        <div className="pointer-events-none absolute inset-x-8 top-1 h-px bg-white/40" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-2 w-16 -translate-x-1/2 rounded-b-full bg-black/70 ring-1 ring-white/10" />
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{getTierLabel(tier)}</div>
        <div className="relative aspect-[16/11] overflow-hidden rounded-[1rem] border border-white/10 bg-black shadow-inner shadow-black/90">
          {coverUrl ? (
            <Image src={coverUrl} alt={`${title} cover art`} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover opacity-[0.82] saturate-[1.08] transition duration-500 group-hover:scale-110 group-hover:opacity-100" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_15%,rgba(108,92,231,.45),transparent_32%),radial-gradient(circle_at_80%_35%,rgba(0,245,255,.22),transparent_28%),linear-gradient(135deg,#171126,#061014)]"><svg aria-hidden="true" className="h-16 w-16 text-white/42" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" /></svg></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.20),transparent_20%,transparent_62%,rgba(255,255,255,0.08))] opacity-70" />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_4px)] opacity-35 mix-blend-screen" />
          <div className={`pointer-events-none absolute inset-0 bg-white/10 opacity-0 ${hovered || playing ? "animate-pulse" : ""}`} />
          <div className="absolute left-3 top-9 flex flex-wrap gap-1.5">{isChampion && <span className="rounded-full border border-gold-300/35 bg-gold-300/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold-100">Champion</span>}{placementLabel && <span className="rounded-full border border-cyan-300/35 bg-cyan-300/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">{placementLabel}</span>}{isTrending && <span className="badge-trending shadow-lg shadow-gold-500/20">Trending</span>}{(isBoosted || boostScore > 0) && <span className="badge-boosted shadow-lg shadow-brand-500/20">Boosted</span>}{isEmbed && embedSource?.label && <span className="rounded-full border border-yellow-300/35 bg-yellow-300/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">{embedSource.label} · Preview only</span>}</div>
          <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/55 backdrop-blur">{isChampion ? "Crown Screen" : playing ? `Bass ${energy}%` : "EMS Screen"}</div>
          {rankScore > 0 && <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 backdrop-blur"><span className="text-[10px] text-white/50">Power</span><span className="text-xs font-bold text-brand-300">{rankScore.toFixed(1)}</span></div>}
          {audioUrl && <button type="button" onClick={handlePlayClick} disabled={audioError} aria-label={audioError ? "Preview unavailable" : playing ? `Pause ${title} preview` : `Play ${title} preview`} className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 shadow-2xl backdrop-blur transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${audioError ? "bg-white/20" : playing ? "bg-accent-500/95 shadow-accent-400/40" : "bg-brand-500/95 shadow-brand-400/35"}`}>{audioError ? <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg> : playing ? <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}</button>}
          <div className="absolute inset-x-3 bottom-16 flex h-12 items-end gap-1 rounded-xl border border-white/8 bg-black/35 px-2 py-2 opacity-80 backdrop-blur-sm transition group-hover:opacity-100">{spectrum.map((height, index) => <span key={`${id}-bar-${index}`} className={`flex-1 rounded-t bg-gradient-to-t from-brand-500 to-accent-300 transition-all duration-75 ${playing ? "opacity-100" : "opacity-45"}`} style={{ height: `${height}%` }} />)}</div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10" aria-hidden="true"><div className="h-full bg-gradient-to-r from-brand-500 via-accent-400 to-gold-300 transition-all" style={{ width: `${playing ? progress : hovered ? 8 : 0}%` }} /></div>
          <div className="absolute inset-x-0 bottom-0 translate-y-4 bg-gradient-to-t from-black/96 via-black/84 to-transparent px-4 pb-4 pt-16 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100"><div className="rounded-xl border border-white/12 bg-black/72 p-3 backdrop-blur-md"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">License from</p><p className="text-xl font-black text-white">{licenseLabel}</p></div><span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2.5 py-1 text-xs font-bold text-gold-200">{revenueShare}% rev share</span></div><div className="mb-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-white/55"><span className="rounded-lg bg-white/7 px-2 py-1.5">{remaining} licenses left</span><span className="rounded-lg bg-white/7 px-2 py-1.5">{soldLicenses}/{totalLicenses} claimed</span></div><Link href={`/track/${id}`} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-white px-4 text-sm font-black text-black transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Buy / License</Link></div></div>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-2 pb-3 pt-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                {rankPosition ? `#${rankPosition}` : "Unranked"}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Dominance {dominancePercent}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              {playing && (
                <span className="flex items-end gap-[2px] h-3 shrink-0">
                  {[1, 2, 3].map((b) => (
                    <span
                      key={b}
                      className="w-[3px] rounded-full bg-accent-400"
                      style={{
                        height: `${40 + b * 20}%`,
                        animation: `equalize 0.${5 + b}s ease-in-out infinite alternate`,
                        animationDelay: `${b * 0.08}s`,
                      }}
                    />
                  ))}
                </span>
              )}
              <Link
                href={`/track/${id}`}
                className={`line-clamp-1 font-black transition hover:text-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${playing ? "text-accent-300" : "text-white"}`}
              >
                {title}
              </Link>
            </div>
            <p className={`mt-1 line-clamp-1 text-sm ${playing ? "text-accent-300/60" : "text-white/50"}`}>{artist}</p>
          </div>

          <div className="flex min-h-7 flex-wrap gap-1.5">
            {/* Quality-of-life metadata chips. Mood is heuristic (see
             *  songMood.ts) but lets sync buyers scan vibe before they
             *  click. EMS Score is a separate prominent chip so the
             *  AI-quality status reads as proof, not flavor. The
             *  scarcity chip ("X of Y claimed") makes every track read
             *  as an asset with a finite supply rather than infinite
             *  streaming — buyers move faster on visible scarcity. */}
            {typeof aiScore === "number" && aiScore > 0 && (
              <span
                title="EMS AI quality score — public ranking signal"
                className="inline-flex items-center gap-1 rounded-full border border-gold-300/45 bg-gold-300/12 px-2.5 py-1 text-xs font-black text-gold-100"
              >
                <span aria-hidden>◆</span>
                EMS {aiScore.toFixed(1)}
              </span>
            )}
            {totalLicenses > 0 && (
              <span
                title={`${soldLicenses} of ${totalLicenses} licenses claimed (${remainingPct}% available)`}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                  soldOutSoon
                    ? "border-red-400/55 bg-red-500/10 text-red-200"
                    : "border-white/15 bg-white/[0.06] text-white/75"
                }`}
              >
                <span aria-hidden>{soldOutSoon ? "🔥" : "🎫"}</span>
                {soldLicenses}/{totalLicenses} claimed
              </span>
            )}
            {genre && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">{genre}</span>}
            {bpm && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">{bpm} BPM</span>}
            {musicalKey && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">Key {musicalKey}</span>}
            {mood && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">{mood}</span>}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-2">
            <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
              <span>Control Meter</span>
              <span>{rankScore.toFixed(1)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${isChampion ? "bg-gradient-to-r from-gold-400 via-white to-accent-300" : "bg-gradient-to-r from-brand-500 to-accent-300"}`}
                style={{ width: `${dominancePercent}%` }}
              />
            </div>
            {competitorGap != null && competitorGap > 0 && (
              <p className="mt-2 text-[11px] font-semibold text-gold-200/75">
                Only {competitorGap.toFixed(1)} power from taking the next slot.
              </p>
            )}
          </div>

          {rankingFactors && (
            <details className="group/why rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-2.5 text-xs text-white/70">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold uppercase tracking-[0.12em] text-cyan-100">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3 w-3 text-cyan-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v.01M12 11v5" strokeLinecap="round" />
                  </svg>
                  Why this track ranks here
                </span>
                <span className="text-[10px] font-black tracking-widest text-cyan-300/70 transition group-open/why:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-[11px] leading-5 text-white/55">
                Open math. Every factor is public, and a paid boost can never overtake quality —
                {typeof paidBoostCap === "number" ? ` boosts are capped at ${paidBoostCap.toFixed(1)} points` : " boosts are hard-capped"} on this track.
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { label: "AI quality", value: rankingFactors.aiQuality, weight: "64%", color: "from-brand-500 to-accent-300" },
                  { label: "License demand", value: rankingFactors.licenseDemand, weight: "16%", color: "from-gold-400 to-gold-200" },
                  { label: "Stream velocity", value: rankingFactors.streamVelocity, weight: "10%", color: "from-cyan-300 to-cyan-100" },
                  { label: "Versus strength", value: rankingFactors.versusStrength, weight: "6%", color: "from-rose-400 to-amber-300" },
                  { label: "Recency", value: rankingFactors.recency, weight: "4%", color: "from-white/70 to-white/30" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-0.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
                      <span>
                        {row.label} <span className="text-white/30">· weight {row.weight}</span>
                      </span>
                      <span className="text-white">{row.value.toFixed(0)}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${row.color}`}
                        style={{ width: `${Math.max(2, Math.min(100, row.value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-2 text-[11px] leading-5">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-white/55">Paid boost applied</span>
                  <span className="font-semibold text-white">{Number(paidBoostApplied ?? boostScore).toFixed(1)} pts</span>
                </p>
                <p className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-white/55">Paid share of total</span>
                  <span className={`font-semibold ${paidInfluencePct >= 18 ? "text-amber-200" : "text-white"}`}>
                    {paidInfluencePct.toFixed(1)}%
                  </span>
                </p>
                 {paidBoostCapped && (
                   <p className="mt-1.5 text-[10px] text-amber-200/85">
                     The artist&apos;s requested boost exceeded the cap and was trimmed. Quality still wins.
                   </p>
                 )}
              </div>
            </details>
          )}

          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="font-bold text-brand-300">{licenseLabel} / license</span>
            <span className="rounded-full border border-gold-500/20 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-300">{revenueShare}% rev share</span>
          </div>

          <div>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className={soldOutSoon ? "font-semibold text-red-300" : "text-white/45"}>
                {remaining} of {totalLicenses} left
                {soldOutSoon && " · Almost gone"}
              </span>
              <span className="text-white/30">{remainingPct}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/8">
              <div
                className={`h-full rounded-full transition-all ${soldOutSoon ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-brand-500 to-accent-500"}`}
                style={{ width: `${remainingPct}%` }}
              />
            </div>
          </div>

          {/* License-forward CTA stack. The headline button is the money
           *  action (License This Track); the secondary row carries the
           *  remix/stems entry point when stems are available and the
           *  Versus battle CTA when the caller has marked this track
           *  eligible. Versus drives the share-out growth loop —
           *  invite friends → battle → "WHO WON?" → more signups.
           *  PromoteSongButton stays in the row as a no-op for non-
           *  owners and a real promotion entry for owners. */}
          <div className="space-y-2">
            <Link
              href={`/track/${id}`}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-accent-500 px-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition hover:from-brand-400 hover:to-accent-400 hover:shadow-brand-400/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            >
              <span aria-hidden>🔑</span>
              License This Track
            </Link>
            {(() => {
              // Count the conditional secondary CTAs so we can pick the
              // right grid column count without ternary stacking.
              const slots = 1 + (hasStems ? 1 : 0) + (verzuzHref ? 1 : 0);
              const gridClass =
                slots >= 3
                  ? "grid grid-cols-3 gap-2"
                  : slots === 2
                    ? "grid grid-cols-2 gap-2"
                    : "grid grid-cols-1 gap-2";
              return (
                <div className={gridClass}>
                  {hasStems && (
                    <Link
                      href={`/track/${id}#stems`}
                      title="Buy a license that unlocks the trackout (vocals, drums, bass, other) for remixing."
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-tube-300/45 bg-tube-300/10 px-3 text-xs font-bold uppercase tracking-wider text-tube-100 transition hover:border-tube-300/70 hover:bg-tube-300/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-tube-300"
                    >
                      <span aria-hidden>🎚️</span>
                      Stems / Remix
                    </Link>
                  )}
                  {verzuzHref && (
                    <Link
                      href={verzuzHref}
                      title={`Start a Verzuz battle with "${title}" on the setlist`}
                      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-400/45 bg-rose-500/10 px-3 text-xs font-bold uppercase tracking-wider text-rose-200 transition hover:border-rose-400/70 hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                    >
                      <span aria-hidden>⚔️</span>
                      Start Versus
                    </Link>
                  )}
                  <PromoteSongButton songId={id} />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      <div className="mx-auto h-4 w-24 rounded-b-2xl bg-gradient-to-b from-zinc-700 to-zinc-950 shadow-lg shadow-black/50" /><div className="mx-auto h-1.5 w-36 rounded-full bg-black/70" />
    </article>
  );
}
