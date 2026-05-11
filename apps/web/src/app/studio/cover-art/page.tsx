"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";

type CoverArtResponse = {
  ok: boolean;
  prompt?: string;
  imageBase64?: string | null;
  imageUrl?: string | null;
  error?: string;
  unavailable?: boolean;
};

const MOODS = ["cinematic", "luxury", "street", "dark", "emotional", "triumphant", "futuristic", "minimal"];

export default function CoverArtPage() {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("Hip-hop");
  const [mood, setMood] = useState("cinematic");
  const [description, setDescription] = useState("");
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [generated, setGenerated] = useState<CoverArtResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const generatedSrc = useMemo(() => {
    if (!generated?.ok) return null;
    if (generated.imageBase64) return `data:image/png;base64,${generated.imageBase64}`;
    return generated.imageUrl ?? null;
  }, [generated]);

  function onUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setUploadedName(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadedPreview(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function onGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setGenerated(null);
    try {
      const response = await fetch("/api/studio/cover-art/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, artist, genre, mood, description }),
      });
      const data = (await response.json()) as CoverArtResponse;
      setGenerated(data);
    } catch (error) {
      setGenerated({ ok: false, error: error instanceof Error ? error.message : "Could not generate cover art." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[2rem] border border-fuchsia-300/20 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.20),transparent_34%),linear-gradient(135deg,rgba(8,8,14,0.98),rgba(4,4,8,0.98)_50%,rgba(35,12,48,0.86))] p-6 shadow-2xl shadow-fuchsia-950/25 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.45em] text-fuchsia-200/80">Epic Music Space Artwork Lab</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">Cover art upload + AI generator.</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
                Upload existing artwork, preview it instantly, or generate new album-cover concepts with AI for marketplace, streaming, battles, and release campaigns.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/studio/ai" className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white/80 hover:bg-white/10">
                AI Studio
              </Link>
              <Link href="/studio/board" className="rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black hover:bg-fuchsia-200">
                Studio Board
              </Link>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/40">Upload artwork</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-white/20 bg-black/35 p-6 text-center hover:border-fuchsia-300/50 hover:bg-fuchsia-300/10">
              <span className="text-4xl">🖼️</span>
              <span className="mt-3 text-sm font-black uppercase tracking-[0.2em] text-white/80">Choose cover art</span>
              <span className="mt-2 text-xs leading-5 text-white/45">PNG, JPG, or WebP. Square artwork recommended.</span>
              <input className="hidden" type="file" accept="image/*" onChange={onUpload} />
            </label>
            {uploadedPreview ? (
              <div className="mt-5 space-y-3">
                <img src={uploadedPreview} alt="Uploaded cover art preview" className="aspect-square w-full rounded-3xl border border-white/10 object-cover" />
                <p className="text-xs text-white/50">Selected: <span className="text-white/80">{uploadedName}</span></p>
              </div>
            ) : (
              <div className="mt-5 aspect-square rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black p-5 text-sm text-white/40">
                Artwork preview appears here.
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-fuchsia-200/80">AI cover generator</p>
            <form onSubmit={onGenerate} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-white/50">
                Song title
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" className="mt-1 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-fuchsia-300/60" />
              </label>
              <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-white/50">
                Artist
                <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist name" className="mt-1 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-fuchsia-300/60" />
              </label>
              <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-white/50">
                Genre
                <input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Hip-hop, R&B, drill..." className="mt-1 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-fuchsia-300/60" />
              </label>
              <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-white/50">
                Mood
                <select value={mood} onChange={(event) => setMood(event.target.value)} className="mt-1 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-fuchsia-300/60">
                  {MOODS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-bold uppercase tracking-widest text-white/50 md:col-span-2">
                Creative direction
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the cover: colors, symbols, story, luxury, streets, futuristic city, etc." className="mt-1 min-h-28 w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-fuchsia-300/60" />
              </label>
              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <button disabled={loading} className="rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-60" type="submit">
                  {loading ? "Generating..." : "Generate cover"}
                </button>
                <p className="text-xs text-white/45">Requires OPENAI_API_KEY in Vercel for live image generation.</p>
              </div>
            </form>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/35 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.32em] text-white/40">Result</p>
              {generatedSrc ? (
                <img src={generatedSrc} alt="Generated cover art" className="mt-4 aspect-square max-w-md rounded-3xl border border-white/10 object-cover" />
              ) : generated ? (
                <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                  <p className="font-black">{generated.unavailable ? "AI generation unavailable" : "Generation did not complete"}</p>
                  <p className="mt-2 text-amber-100/75">{generated.error ?? "Check configuration and try again."}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/45">Generated cover art or setup guidance will appear here.</p>
              )}
              {generated?.prompt ? (
                <details className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">
                  <summary className="cursor-pointer font-black uppercase tracking-widest text-white/70">Generated prompt</summary>
                  <p className="mt-2 leading-5">{generated.prompt}</p>
                </details>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
