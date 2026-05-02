"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice } from "@ems/utils";
import PromoteSongButton from "@/components/PromoteSongButton";

type PriceLike = string | number | { toString(): string };

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
  aiScore?: number;
  boostScore?: number;
  isTrending?: boolean;
  isBoosted?: boolean;
}

function displayPrice(value: PriceLike) {
  return formatPrice(typeof value === "number" || typeof value === "string" ? value : value.toString());
}

const visualizerBars = [34, 62, 44, 76, 52, 88, 41, 70, 95, 58, 47, 82, 38, 66, 51, 73, 46, 90];

export default function SongCard({ id, title, artist, genre, coverUrl, audioUrl, licensePrice, revenueSharePct, soldLicenses, totalLicenses, bpm, musicalKey, aiScore, boostScore = 0, isTrending = false, isBoosted = false }: SongCardProps) {
  const remaining = Math.max(0, totalLicenses - soldLicenses);
  const remainingPct = totalLicenses > 0 ? Math.round((remaining / totalLicenses) * 100) : 0;
  const soldOutSoon = totalLicenses > 0 && remainingPct <= 20;
  const revenueShare = revenueSharePct.toString();
  const licenseLabel = displayPrice(licensePrice);
  const rankScore = Number(aiScore ?? 0) + Number(boostScore ?? 0);
  const isChampion = rankScore > 0 && rankScore >= 250;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioError, setAudioError] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [spectrum, setSpectrum] = useState<number[]>(visualizerBars.map((bar) => bar * 0.45));

  const wallTilt = useMemo(() => {
    const seed = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return seed % 2 === 0 ? "md:rotate-y-[-5deg]" : "md:rotate-y-[5deg]";
  }, [id]);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      void audioContextRef.current?.close().catch(() => undefined);
    };
  }, []);

  function startAnalyser() {
    const audio = audioRef.current;
    if (!audio) return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
    const context = audioContextRef.current;
    void context.resume();
    if (!analyserRef.current) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;
    }
    if (!sourceRef.current) {
      sourceRef.current = context.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(context.destination);
    }
    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const nextSpectrum = visualizerBars.map((fallback, index) => Math.max(12, Math.min(100, ((data[index % data.length] ?? fallback) / 255) * 100)));
      const bass = data.slice(0, 6).reduce((sum, value) => sum + value, 0) / (6 * 255);
      setEnergy(Math.round(bass * 100));
      setSpectrum(nextSpectrum);
      animationRef.current = requestAnimationFrame(tick);
    };
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    tick();
  }

  function handlePlayClick() {
    if (!audioUrl || audioError) return;
    if (!audioRef.current) {
      const audio = new Audio(audioUrl);
      audio.crossOrigin = "anonymous";
      audio.preload = "metadata";
      audio.volume = 0.8;
      audio.addEventListener("timeupdate", () => {
        if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
      });
      audio.addEventListener("ended", () => {
        setPlaying(false);
        setProgress(0);
        setEnergy(0);
        audio.currentTime = 0;
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      });
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("error", () => {
        setAudioError(true);
        setPlaying(false);
      });
      audioRef.current = audio;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    startAnalyser();
    void audioRef.current.play().then(() => setPlaying(true)).catch(() => {
      setAudioError(true);
      setPlaying(false);
    });
  }

  return (
    <article className={`group relative transform-gpu transition duration-500 [transform-style:preserve-3d] hover:z-20 hover:scale-[1.035] hover:rotate-y-0 ${wallTilt}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {isChampion && <div className="absolute -top-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-gold-300/40 bg-black px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-gold-100 shadow-2xl shadow-gold-500/20">Crowned Champion</div>}
      <div className={`absolute -inset-3 rounded-[2rem] bg-gradient-to-br blur-2xl transition duration-500 ${isChampion ? "from-gold-300/40 via-gold-500/22 to-accent-300/18 opacity-100" : "from-brand-500/0 via-accent-400/0 to-gold-300/0 opacity-0 group-hover:from-brand-500/28 group-hover:via-accent-400/18 group-hover:to-gold-300/18 group-hover:opacity-100"}`} style={{ opacity: playing ? Math.max(0.35, energy / 100) : undefined }} />
      <div className={`relative overflow-hidden rounded-[1.35rem] border bg-gradient-to-b from-zinc-800 via-[#101118] to-black p-2 shadow-2xl shadow-black/60 transition duration-500 ${isChampion ? "border-gold-300/45 shadow-gold-500/15" : "border-white/12 group-hover:border-accent-300/45 group-hover:shadow-accent-500/12"}`}>
        <div className="pointer-events-none absolute inset-x-8 top-1 h-px bg-white/40" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-2 w-16 -translate-x-1/2 rounded-b-full bg-black/70 ring-1 ring-white/10" />
        <div className="relative aspect-[16/11] overflow-hidden rounded-[1rem] border border-white/10 bg-black shadow-inner shadow-black/90">
          {coverUrl ? (
            <img src={coverUrl} alt={`${title} cover art`} width={640} height={640} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-[0.82] saturate-[1.08] transition duration-500 group-hover:scale-110 group-hover:opacity-100" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_20%_15%,rgba(108,92,231,.45),transparent_32%),radial-gradient(circle_at_80%_35%,rgba(0,245,255,.22),transparent_28%),linear-gradient(135deg,#171126,#061014)]"><svg aria-hidden="true" className="h-16 w-16 text-white/42" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h6V3h-8Z" /></svg></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/18 to-black/8" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.20),transparent_20%,transparent_62%,rgba(255,255,255,0.08))] opacity-70" />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_4px)] opacity-35 mix-blend-screen" />
          <div className={`pointer-events-none absolute inset-0 bg-white/10 opacity-0 ${hovered || playing ? "animate-pulse" : ""}`} />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{isChampion && <span className="rounded-full border border-gold-300/35 bg-gold-300/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gold-100">Champion</span>}{isTrending && <span className="badge-trending shadow-lg shadow-gold-500/20">Trending</span>}{(isBoosted || boostScore > 0) && <span className="badge-boosted shadow-lg shadow-brand-500/20">Boosted</span>}</div>
          <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/55 backdrop-blur">{isChampion ? "Crown Screen" : playing ? `Bass ${energy}%` : "EMS Screen"}</div>
          {rankScore > 0 && <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-2.5 py-1 backdrop-blur"><span className="text-[10px] text-white/50">Rank</span><span className="text-xs font-bold text-brand-300">{rankScore.toFixed(1)}</span></div>}
          {audioUrl && <button type="button" onClick={handlePlayClick} disabled={audioError} aria-label={audioError ? "Preview unavailable" : playing ? `Pause ${title} preview` : `Play ${title} preview`} className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 shadow-2xl backdrop-blur transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${audioError ? "bg-white/20" : playing ? "bg-accent-500/95 shadow-accent-400/40" : "bg-brand-500/95 shadow-brand-400/35"}`}>{audioError ? <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg> : playing ? <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg> : <svg className="ml-0.5 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}</button>}
          <div className="absolute inset-x-3 bottom-16 flex h-12 items-end gap-1 rounded-xl border border-white/8 bg-black/35 px-2 py-2 opacity-80 backdrop-blur-sm transition group-hover:opacity-100">{spectrum.map((height, index) => <span key={`${id}-bar-${index}`} className={`flex-1 rounded-t bg-gradient-to-t from-brand-500 to-accent-300 transition-all duration-75 ${playing ? "opacity-100" : "opacity-45"}`} style={{ height: `${height}%` }} />)}</div>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10" aria-hidden="true"><div className="h-full bg-gradient-to-r from-brand-500 via-accent-400 to-gold-300 transition-all" style={{ width: `${playing ? progress : hovered ? 8 : 0}%` }} /></div>
          <div className="absolute inset-x-0 bottom-0 translate-y-4 bg-gradient-to-t from-black/96 via-black/84 to-transparent px-4 pb-4 pt-16 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100"><div className="rounded-xl border border-white/12 bg-black/72 p-3 backdrop-blur-md"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">License from</p><p className="text-xl font-black text-white">{licenseLabel}</p></div><span className="rounded-full border border-gold-400/25 bg-gold-400/10 px-2.5 py-1 text-xs font-bold text-gold-200">{revenueShare}% rev share</span></div><div className="mb-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-white/55"><span className="rounded-lg bg-white/7 px-2 py-1.5">{remaining} licenses left</span><span className="rounded-lg bg-white/7 px-2 py-1.5">{soldLicenses}/{totalLicenses} claimed</span></div><Link href={`/track/${id}`} className="inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-white px-4 text-sm font-black text-black transition hover:bg-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">Buy / License</Link></div></div>
        </div>
        <div className="flex flex-1 flex-col gap-4 px-2 pb-3 pt-4"><div><Link href={`/track/${id}`} className="line-clamp-1 font-black text-white transition hover:text-accent-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">{title}</Link><p className="mt-1 line-clamp-1 text-sm text-white/50">{artist}</p></div><div className="flex min-h-7 flex-wrap gap-1.5">{genre && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">{genre}</span>}{bpm && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">{bpm} BPM</span>}{musicalKey && <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-medium text-white/64">Key {musicalKey}</span>}</div><div className="flex items-start justify-between gap-3 text-sm"><span className="font-bold text-brand-300">{licenseLabel} / license</span><span className="rounded-full border border-gold-500/20 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold text-gold-300">{revenueShare}% rev share</span></div><div><div className="mb-1 flex justify-between gap-3 text-xs"><span className={soldOutSoon ? "font-semibold text-red-300" : "text-white/45"}>{remaining} of {totalLicenses} left{soldOutSoon && " · Almost gone"}</span><span className="text-white/30">{remainingPct}%</span></div><div className="h-1.5 w-full rounded-full bg-white/8"><div className={`h-full rounded-full transition-all ${soldOutSoon ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-brand-500 to-accent-500"}`} style={{ width: `${remainingPct}%` }} /></div></div><div className="grid grid-cols-2 gap-2"><Link href={`/track/${id}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/12 bg-white/8 px-4 text-sm font-bold text-white transition hover:border-accent-300/50 hover:bg-accent-400/15 hover:text-accent-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400">View</Link><PromoteSongButton songId={id} /></div></div>
      </div>
      <div className="mx-auto h-4 w-24 rounded-b-2xl bg-gradient-to-b from-zinc-700 to-zinc-950 shadow-lg shadow-black/50" /><div className="mx-auto h-1.5 w-36 rounded-full bg-black/70" />
    </article>
  );
}
