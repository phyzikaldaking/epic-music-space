"use client";

import { useEffect, useRef, useState } from "react";
import {
  extractLoudestClip,
  generateSquareCover,
  generateVerticalCover,
} from "@/lib/promoKit";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface SongOption {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  audioUrl: string | null;
  aiScore: number;
}

interface Props {
  songs: SongOption[];
}

type Phase = "idle" | "generating" | "ready" | "error";

interface Outputs {
  square: string;
  vertical: string;
  audioBlobUrl: string;
  caption: string;
  hashtags: string[];
}

// One-click promo kit. Artist picks a track from their catalog; we
// generate 1080×1080 + 1080×1920 covers (client-side canvas), an
// AI-written caption + hashtags (server route), and a 15s "loudest
// window" audio clip (client-side Web Audio). Each output gets a
// download button. Everything is generated on demand; nothing is
// stored.
export default function PromoKitButton({ songs }: Props) {
  const eligible = songs.filter((s) => s.audioUrl);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    eligible[0]?.id ?? null,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Outputs | null>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(open);

  // Revoke object URLs when closing or switching tracks so we don't
  // leak. New outputs supersede old ones — clear previous URLs first.
  const audioUrlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);
  useEffect(() => {
    if (!open && audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setOutputs(null);
      setPhase("idle");
      setErrorMsg(null);
    }
  }, [open]);

  async function generate() {
    const song = eligible.find((s) => s.id === selectedId);
    if (!song || !song.audioUrl) {
      setErrorMsg("Pick a track with audio first.");
      setPhase("error");
      return;
    }
    setPhase("generating");
    setErrorMsg(null);
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    // Run image + clip + caption in parallel — they're independent.
    // Caption is the only one that can fail "loud" (network/auth);
    // images fall back to gradient + audio raises a thrown error.
    try {
      const Ctor =
        typeof window === "undefined"
          ? null
          : window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext unavailable in this browser");
      const ctx = new Ctor();
      const [square, vertical, captionResult, audioBlob] = await Promise.all([
        generateSquareCover({
          coverUrl: song.coverUrl,
          title: song.title,
          artist: song.artist,
          emsScore: song.aiScore,
        }),
        generateVerticalCover({
          coverUrl: song.coverUrl,
          title: song.title,
          artist: song.artist,
          emsScore: song.aiScore,
        }),
        fetchCaption(song.id),
        extractLoudestClip(song.audioUrl, ctx, 15),
      ]);
      void ctx.close();
      const audioBlobUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioBlobUrl;
      setOutputs({
        square,
        vertical,
        audioBlobUrl,
        caption: captionResult.caption,
        hashtags: captionResult.hashtags,
      });
      setPhase("ready");
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Couldn't build the kit — try a different track.",
      );
      setPhase("error");
    }
  }

  function downloadFromDataUrl(dataUrl: string, filename: string) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyCaption() {
    if (!outputs) return;
    const text = `${outputs.caption} ${outputs.hashtags
      .map((h) => `#${h}`)
      .join(" ")}`;
    void navigator.clipboard?.writeText(text);
  }

  if (eligible.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-400/10 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <span aria-hidden>📣</span>
        One-click promo kit
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="One-click promo kit"
          ref={focusTrapRef}
          className="fixed inset-0 z-[170] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
        >
          <div className="w-[min(720px,100%)] max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-400/40 bg-[#0a0a10]/95 p-6 shadow-2xl shadow-black/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-300">
                  One-click promo kit
                </p>
                <h2 className="mt-1 font-display text-xl uppercase tracking-wide text-white">
                  Build share assets for a track
                </h2>
                <p className="mt-1 text-xs text-white/55">
                  Generates a square cover, a vertical cover, an AI caption +
                  hashtags, and a 15-second audio clip — all in one click.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md border border-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/65 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
              Track
            </label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setOutputs(null);
                setPhase("idle");
              }}
              aria-label="Choose track for the promo kit"
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
            >
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.aiScore ? ` · EMS ${s.aiScore.toFixed(1)}` : ""}
                </option>
              ))}
            </select>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generate}
                disabled={phase === "generating" || !selectedId}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black uppercase tracking-wider text-black transition hover:bg-amber-300 disabled:opacity-50"
              >
                {phase === "generating" ? "Building…" : "Generate kit"}
              </button>
              {phase === "generating" && (
                <p className="text-[11px] text-white/55">
                  Covers render in ~1s. Audio clip needs the whole track to
                  download first.
                </p>
              )}
              {errorMsg && (
                <p className="text-[11px] text-rose-300">{errorMsg}</p>
              )}
            </div>

            {outputs && (
              <div className="mt-6 space-y-5">
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
                    Cover · square (1080×1080)
                  </p>
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={outputs.square}
                      alt="Square cover preview"
                      className="aspect-square w-full rounded-lg border border-white/10 object-cover"
                    />
                    <div className="space-y-2 text-xs text-white/65">
                      <p>For Twitter / IG feed / WhatsApp.</p>
                      <button
                        type="button"
                        onClick={() =>
                          downloadFromDataUrl(outputs.square, "cover-square.png")
                        }
                        className="rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/20"
                      >
                        Download PNG
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
                    Cover · vertical (1080×1920)
                  </p>
                  <div className="grid grid-cols-[100px_1fr] gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={outputs.vertical}
                      alt="Vertical cover preview"
                      className="aspect-[9/16] w-full rounded-lg border border-white/10 object-cover"
                    />
                    <div className="space-y-2 text-xs text-white/65">
                      <p>For TikTok / IG Reels / Stories.</p>
                      <button
                        type="button"
                        onClick={() =>
                          downloadFromDataUrl(
                            outputs.vertical,
                            "cover-vertical.png",
                          )
                        }
                        className="rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/20"
                      >
                        Download PNG
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
                    Caption + hashtags
                  </p>
                  <textarea
                    readOnly
                    value={`${outputs.caption} ${outputs.hashtags
                      .map((h) => `#${h}`)
                      .join(" ")}`}
                    aria-label="Generated promo caption"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={copyCaption}
                    className="mt-2 rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/20"
                  >
                    Copy to clipboard
                  </button>
                </div>

                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-white/55">
                    15-second clip
                  </p>
                  <audio src={outputs.audioBlobUrl} controls className="w-full">
                    <track kind="captions" />
                  </audio>
                  <a
                    href={outputs.audioBlobUrl}
                    download="clip-15s.wav"
                    className="mt-2 inline-block rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-400/20"
                  >
                    Download WAV
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

async function fetchCaption(songId: string): Promise<{
  caption: string;
  hashtags: string[];
}> {
  try {
    const res = await fetch("/api/ai/promo-caption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId, platform: "twitter" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      caption?: string;
      hashtags?: string[];
    };
    return {
      caption: data.caption ?? "",
      hashtags: data.hashtags ?? [],
    };
  } catch {
    // Caption failure shouldn't block the kit — fall back to a
    // sensible default so the artist still gets covers + audio.
    return {
      caption: "Out now on Epic Music Space — license + remix below.",
      hashtags: ["newmusic", "ems", "indie"],
    };
  }
}
