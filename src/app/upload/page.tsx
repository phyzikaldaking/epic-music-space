"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Upload, Music, ImagePlus, DollarSign, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type SaleType = "free" | "fixed" | "pwyw" | "auction";

export default function UploadPage() {
  const { user, profile } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("free");
  const [price, setPrice] = useState("");
  const [minPrice, setMinPrice] = useState("1");
  const [auctionEnd, setAuctionEnd] = useState("");
  const [allowsResale, setAllowsResale] = useState(false);
  const [allowsInvestment, setAllowsInvestment] = useState(false);
  const [investmentShares, setInvestmentShares] = useState("100");

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAudioFile(e.target.files?.[0] ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !audioFile) return;

    setUploading(true);
    setError(null);
    setProgress(10);

    const supabase = createClient();
    const fileExt = audioFile.name.split(".").pop();
    const audioPath = `${user.id}/${Date.now()}.${fileExt}`;

    // Upload audio
    const { error: audioError } = await supabase.storage
      .from("songs")
      .upload(audioPath, audioFile, { cacheControl: "3600", upsert: false });

    if (audioError) {
      setError(audioError.message);
      setUploading(false);
      return;
    }

    setProgress(50);

    // Get public URL
    const { data: { publicUrl: audioUrl } } = supabase.storage
      .from("songs")
      .getPublicUrl(audioPath);

    // Upload cover (optional)
    let coverUrl: string | null = null;
    if (coverFile) {
      const coverExt = coverFile.name.split(".").pop();
      const coverPath = `${user.id}/${Date.now()}.${coverExt}`;
      const { error: coverError } = await supabase.storage
        .from("covers")
        .upload(coverPath, coverFile, { cacheControl: "3600", upsert: false });

      if (!coverError) {
        const { data: { publicUrl } } = supabase.storage
          .from("covers")
          .getPublicUrl(coverPath);
        coverUrl = publicUrl;
      }
    }

    setProgress(75);

    // Insert song record
    const { data: song, error: insertError } = await supabase
      .from("songs")
      .insert({
        artist_id: user.id,
        title,
        description: description || null,
        genre: genre || null,
        cover_url: coverUrl,
        audio_url: audioUrl,
        sale_type: saleType,
        price: saleType === "fixed" ? parseFloat(price) : null,
        min_price: saleType === "pwyw" ? parseFloat(minPrice) : null,
        auction_end: saleType === "auction" ? auctionEnd : null,
        allows_resale: allowsResale,
        allows_investment: allowsInvestment,
        investment_shares: allowsInvestment ? parseInt(investmentShares) : 0,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    // Update profile to artist
    if (!profile?.is_artist) {
      await supabase.from("profiles").update({ is_artist: true }).eq("id", user.id);
    }

    setProgress(100);
    router.push(`/song/${song.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Upload a Song</h1>
        <p className="text-gray-400 text-sm mt-1">Share your music with the cosmos</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Cover + Audio row */}
        <div className="flex gap-4">
          {/* Cover art */}
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="w-32 h-32 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:border-purple-500/60 transition-colors relative overflow-hidden shrink-0"
          >
            {coverPreview ? (
              <>
                <Image src={coverPreview} alt="Cover" fill className="object-cover" unoptimized />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <ImagePlus size={24} className="text-white" />
                </div>
              </>
            ) : (
              <>
                <ImagePlus size={24} className="text-gray-500" />
                <span className="text-xs text-gray-500">Cover art</span>
              </>
            )}
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />

          {/* Audio file */}
          <div className="flex-1">
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="w-full h-32 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-2 hover:border-purple-500/60 transition-colors"
            >
              {audioFile ? (
                <>
                  <Music size={24} className="text-purple-400" />
                  <span className="text-sm text-white font-medium truncate max-w-[200px]">{audioFile.name}</span>
                  <span className="text-xs text-gray-400">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-gray-500" />
                  <span className="text-sm text-gray-400">Click to upload audio</span>
                  <span className="text-xs text-gray-600">MP3, WAV, FLAC, AAC</span>
                </>
              )}
            </button>
            <input ref={audioInputRef} type="file" accept="audio/*" required className="hidden" onChange={handleAudioChange} />
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Song title"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Tell the story behind this track…"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
          />
        </div>

        {/* Genre */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Genre</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="">Select genre</option>
            {["Electronic", "Hip-Hop", "R&B", "Pop", "Rock", "Jazz", "Classical", "Ambient", "Lofi", "House", "Techno", "Trap", "Drill", "Afrobeats", "Reggaeton", "Other"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Monetization */}
        <div>
          <label className="text-sm text-gray-300 block mb-3">Monetization</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["free", "fixed", "pwyw", "auction"] as SaleType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSaleType(type)}
                className={`py-2.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                  saleType === type
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30"
                }`}
              >
                {type === "pwyw" ? "Pay-What-You-Want" : type}
              </button>
            ))}
          </div>

          {saleType === "fixed" && (
            <div className="mt-3">
              <label className="text-sm text-gray-300 block mb-1">Price (USD)</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  min="0.99"
                  step="0.01"
                  placeholder="9.99"
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          )}

          {saleType === "pwyw" && (
            <div className="mt-3">
              <label className="text-sm text-gray-300 block mb-1">Minimum Price (USD)</label>
              <div className="relative">
                <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  min="1"
                  step="1"
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </div>
          )}

          {saleType === "auction" && (
            <div className="mt-3">
              <label className="text-sm text-gray-300 block mb-1">Auction End Date</label>
              <input
                type="datetime-local"
                value={auctionEnd}
                onChange={(e) => setAuctionEnd(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Advanced options */}
        <div className="space-y-3">
          <label className="text-sm text-gray-400 block">Advanced</label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowsResale}
              onChange={(e) => setAllowsResale(e.target.checked)}
              className="w-4 h-4 accent-purple-600"
            />
            <div>
              <p className="text-sm text-white">Allow resale</p>
              <p className="text-xs text-gray-500">Buyers can resell this track on the marketplace</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowsInvestment}
              onChange={(e) => setAllowsInvestment(e.target.checked)}
              className="w-4 h-4 accent-purple-600"
            />
            <div>
              <p className="text-sm text-white">Allow fan investment</p>
              <p className="text-xs text-gray-500">Fans can buy ownership shares of this track</p>
            </div>
          </label>
          {allowsInvestment && (
            <div>
              <label className="text-sm text-gray-300 block mb-1">Total shares available</label>
              <input
                type="number"
                value={investmentShares}
                onChange={(e) => setInvestmentShares(e.target.value)}
                min="1"
                max="10000"
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={uploading || !audioFile || !title}
          className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Uploading… {progress}%
            </>
          ) : (
            <>
              <Upload size={18} />
              Upload Song
            </>
          )}
        </button>
      </form>
    </div>
  );
}
