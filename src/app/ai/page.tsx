"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Sparkles,
  ImagePlus,
  Lightbulb,
  Music2,
  Wand2,
  Loader2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AISuggestion {
  type: string;
  title: string;
  description: string;
  action: string;
  actionHref: string | null;
}

interface SuggestionsResponse {
  suggestions: AISuggestion[];
  dataPoints: {
    totalSongs: number;
    followers: number;
    topGenre: string;
    avgPlays: number;
  };
}

const GENRES = ["Electronic", "Hip-Hop", "R&B", "Pop", "Rock", "Jazz", "Ambient", "House", "Trap", "Other"];
const MOODS = ["Dark", "Uplifting", "Chill", "Energetic", "Dreamy", "Aggressive", "Melancholic"];
const STYLES = ["Minimalist", "Psychedelic", "Futuristic", "Abstract", "Photorealistic", "Retro", "Cosmic"];

export default function AIPage() {
  const { user } = useAuth();

  // Cover generator state
  const [coverTitle, setCoverTitle] = useState("");
  const [coverGenre, setCoverGenre] = useState("");
  const [coverMood, setCoverMood] = useState("");
  const [coverStyle, setCoverStyle] = useState("");
  const [generatingCover, setGeneratingCover] = useState(false);
  const [generatedCover, setGeneratedCover] = useState<string | null>(null);
  const [coverPrompt, setCoverPrompt] = useState<string | null>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const generateCover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverTitle) return;
    setGeneratingCover(true);
    setGeneratedCover(null);

    const res = await fetch("/api/ai/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: coverTitle,
        genre: coverGenre,
        mood: coverMood,
        style: coverStyle,
      }),
    });

    const data = await res.json();
    if (data.coverUrl) {
      setGeneratedCover(data.coverUrl);
      setCoverPrompt(data.prompt);
    }
    setGeneratingCover(false);
  };

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    const res = await fetch("/api/ai/suggestions");
    const data = await res.json();
    setSuggestions(data);
    setLoadingSuggestions(false);
  };

  useEffect(() => {
    if (user) loadSuggestions();
  }, [user]);

  const suggestionIcons: Record<string, React.ReactNode> = {
    pricing: <Music2 size={18} className="text-green-400" />,
    engagement: <Sparkles size={18} className="text-pink-400" />,
    content: <Wand2 size={18} className="text-purple-400" />,
    billboard: <ImagePlus size={18} className="text-blue-400" />,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles size={22} className="text-purple-400" />
          AI Tools
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          AI-powered tools to accelerate your music career
        </p>
      </div>

      {/* Cover Generator */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center">
            <ImagePlus size={20} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Cover Generator</h2>
            <p className="text-gray-400 text-sm">Generate album artwork from your track details</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <form onSubmit={generateCover} className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1">Track title *</label>
              <input
                type="text"
                value={coverTitle}
                onChange={(e) => setCoverTitle(e.target.value)}
                required
                placeholder="Your track name"
                className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-300 block mb-1">Genre</label>
                <select
                  value={coverGenre}
                  onChange={(e) => setCoverGenre(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                >
                  <option value="">Any</option>
                  {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300 block mb-1">Mood</label>
                <select
                  value={coverMood}
                  onChange={(e) => setCoverMood(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500 transition-colors text-sm"
                >
                  <option value="">Any</option>
                  {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-300 block mb-1">Art style</label>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCoverStyle(coverStyle === s ? "" : s)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs border transition-all",
                      coverStyle === s
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!coverTitle || generatingCover || !user}
              className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generatingCover ? (
                <><Loader2 size={16} className="animate-spin" /> Generating…</>
              ) : (
                <><Wand2 size={16} /> Generate Cover</>
              )}
            </button>

            {!user && (
              <p className="text-xs text-gray-500 text-center">
                <Link href="/login" className="text-purple-400 hover:underline">Sign in</Link> to generate covers
              </p>
            )}
          </form>

          <div className="flex flex-col items-center justify-center">
            {generatedCover ? (
              <div className="space-y-3 w-full">
                <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/50">
                  <Image
                    src={generatedCover}
                    alt="Generated cover"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                {coverPrompt && (
                  <p className="text-xs text-gray-500 text-center px-2 line-clamp-2">
                    <span className="text-gray-600">Prompt: </span>{coverPrompt}
                  </p>
                )}
                <a
                  href={generatedCover}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <ExternalLink size={12} />
                  Open full size
                </a>
              </div>
            ) : (
              <div className="aspect-square w-full rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-gray-600">
                <ImagePlus size={40} />
                <p className="text-sm">Your cover will appear here</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* AI Suggestions */}
      <section>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-yellow-600/20 flex items-center justify-center">
            <Lightbulb size={20} className="text-yellow-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Growth Suggestions</h2>
            <p className="text-gray-400 text-sm">Personalized recommendations based on your data</p>
          </div>
          <button
            onClick={loadSuggestions}
            disabled={loadingSuggestions || !user}
            className="ml-auto text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            {loadingSuggestions ? <Loader2 size={12} className="animate-spin" /> : null}
            Refresh
          </button>
        </div>

        {!user ? (
          <div className="text-center py-10 text-gray-400">
            <Link href="/login" className="text-purple-400 hover:underline">Sign in</Link> to get personalized suggestions
          </div>
        ) : loadingSuggestions ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 border border-white/10 p-5 h-32 animate-pulse" />
            ))}
          </div>
        ) : suggestions ? (
          <>
            {/* Data overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Songs", value: suggestions.dataPoints.totalSongs },
                { label: "Followers", value: suggestions.dataPoints.followers.toLocaleString() },
                { label: "Top Genre", value: suggestions.dataPoints.topGenre || "—" },
                { label: "Avg Plays", value: suggestions.dataPoints.avgPlays.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                  <p className="text-white font-bold text-lg">{value}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {suggestions.suggestions.map((s) => (
                <div
                  key={s.type}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    {suggestionIcons[s.type] ?? <Sparkles size={18} className="text-purple-400" />}
                    <h3 className="text-white font-semibold text-sm">{s.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm flex-1">{s.description}</p>
                  {s.actionHref && (
                    <Link
                      href={s.actionHref}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors w-fit"
                    >
                      {s.action}
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {/* Coming soon: Mix Master */}
      <section className="rounded-2xl border border-white/10 bg-white/3 p-6 opacity-60">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
            <Music2 size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              AI Auto Mix & Master
              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full">Coming soon</span>
            </h2>
            <p className="text-gray-500 text-sm">Upload your raw track and get a professionally mastered version</p>
          </div>
        </div>
      </section>
    </div>
  );
}
