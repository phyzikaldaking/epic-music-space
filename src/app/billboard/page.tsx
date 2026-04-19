"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Megaphone,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  ImagePlus,
  DollarSign,
  TrendingUp,
  Grid3X3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Billboard } from "@/types/database";
import { cn } from "@/lib/utils";

interface SlotData {
  availableSlots: number[];
  takenSlots: number[];
  totalSlots: number;
  pricePerWeekUsd: number;
  occupancyRate: number;
}

function BillboardContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const success = searchParams.get("success") === "true";

  const imageInputRef = useRef<HTMLInputElement>(null);

  const [slotData, setSlotData] = useState<SlotData | null>(null);
  const [billboards, setBillboards] = useState<Billboard[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(1);

  const [uploading, setUploading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [slotRes, boardsRes] = await Promise.all([
        fetch("/api/stripe/billboard").then((r) => r.json()),
        supabase
          .from("billboards")
          .select("*")
          .gt("expires_at", new Date().toISOString())
          .order("slot"),
      ]);

      setSlotData(slotRes);
      setBillboards((boardsRes.data ?? []) as Billboard[]);
      setLoading(false);
    };

    fetchData();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSlot || !title || !imageFile) return;

    setError(null);
    setUploading(true);

    const supabase = createClient();

    // Upload image to storage
    const ext = imageFile.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("billboards")
      .upload(path, imageFile, { upsert: false, cacheControl: "3600" });

    if (uploadErr) {
      setError(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl: imageUrl } } = supabase.storage
      .from("billboards")
      .getPublicUrl(path);

    setUploading(false);
    setCheckingOut(true);

    // Create Stripe checkout session
    const res = await fetch("/api/stripe/billboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: selectedSlot, title, imageUrl, clickUrl, weeks }),
    });

    const { url, error: checkoutErr } = await res.json();
    if (checkoutErr) {
      setError(checkoutErr);
      setCheckingOut(false);
      return;
    }

    window.location.href = url;
  };

  const totalPrice = slotData ? slotData.pricePerWeekUsd * weeks : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Megaphone size={24} className="text-purple-400" />
          Billboard System
        </h1>
        <p className="text-gray-400 text-sm mt-0.5">
          Advertise in the EMS city grid — limited slots, scarcity-based pricing
        </p>
      </div>

      {success && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400">
          <CheckCircle size={20} />
          <p>Your billboard is live! It will appear in the city grid shortly.</p>
        </div>
      )}

      {/* Stats row */}
      {slotData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Available Slots", value: slotData.availableSlots.length, icon: Grid3X3, color: "text-green-400" },
            { label: "Taken Slots", value: slotData.takenSlots.length, icon: Megaphone, color: "text-orange-400" },
            { label: "Price / Week", value: `$${slotData.pricePerWeekUsd}`, icon: DollarSign, color: "text-purple-400" },
            { label: "Occupancy", value: `${Math.round(slotData.occupancyRate * 100)}%`, icon: TrendingUp, color: "text-blue-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <Icon size={20} className={color} />
              <p className="text-xl font-bold text-white mt-2">{value}</p>
              <p className="text-gray-400 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active billboards grid */}
      {billboards.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Active Billboards</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {billboards.map((billboard) => (
              <div
                key={billboard.id}
                className="rounded-xl border border-white/10 overflow-hidden bg-white/5 group"
              >
                <div className="relative aspect-video">
                  <Image
                    src={billboard.image_url}
                    alt={billboard.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-black/70 text-xs text-white font-bold">
                    #{billboard.slot}
                  </div>
                </div>
                <div className="p-2 flex items-center justify-between">
                  <p className="text-white text-xs font-medium truncate">{billboard.title}</p>
                  {billboard.click_url && (
                    <a
                      href={billboard.click_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-gray-300 shrink-0 ml-1"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchase form */}
      {user ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-6">Reserve a Billboard Slot</h2>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={24} className="animate-spin text-purple-400" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {/* Slot selector */}
              <div>
                <label className="text-sm text-gray-300 block mb-2">
                  Select a slot ({slotData?.availableSlots.length ?? 0} available)
                </label>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((slot) => {
                    const taken = slotData?.takenSlots.includes(slot);
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={!!taken}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "aspect-square rounded-lg text-sm font-semibold border transition-all",
                          taken
                            ? "bg-red-900/20 border-red-500/20 text-red-600 cursor-not-allowed"
                            : selectedSlot === slot
                            ? "bg-purple-600 border-purple-500 text-white"
                            : "bg-white/5 border-white/10 text-gray-400 hover:border-purple-500/40 hover:text-white"
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm text-gray-300 block mb-1">Ad Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={60}
                  placeholder="Your brand or campaign name"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Image upload */}
              <div>
                <label className="text-sm text-gray-300 block mb-1">Billboard Image (16:9 recommended)</label>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-white/20 hover:border-purple-500/50 transition-colors overflow-hidden"
                  style={{ aspectRatio: "16/9" }}
                >
                  {imagePreview ? (
                    <Image
                      src={imagePreview}
                      alt="Billboard preview"
                      width={800}
                      height={450}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full py-8 gap-2">
                      <ImagePlus size={32} className="text-gray-500" />
                      <span className="text-sm text-gray-500">Click to upload billboard image</span>
                    </div>
                  )}
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  required
                  className="hidden"
                  onChange={handleImageChange}
                />
              </div>

              {/* Click URL */}
              <div>
                <label className="text-sm text-gray-300 block mb-1">Click URL (optional)</label>
                <input
                  type="url"
                  value={clickUrl}
                  onChange={(e) => setClickUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="text-sm text-gray-300 block mb-1">Duration (weeks)</label>
                <div className="flex gap-2">
                  {[1, 2, 4, 8].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeeks(w)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                        weeks === w
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-white/5 border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                      )}
                    >
                      {w}w
                    </button>
                  ))}
                </div>
              </div>

              {/* Price summary */}
              {slotData && selectedSlot && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-400">Slot #{selectedSlot} × {weeks} week{weeks > 1 ? "s" : ""}</span>
                    <span className="text-white font-semibold">${totalPrice}</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    ${slotData.pricePerWeekUsd}/week · demand-based pricing
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={!selectedSlot || !title || !imageFile || uploading || checkingOut}
                className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <><Loader2 size={18} className="animate-spin" /> Uploading image…</>
                ) : checkingOut ? (
                  <><Loader2 size={18} className="animate-spin" /> Redirecting to payment…</>
                ) : (
                  <><Megaphone size={18} /> Reserve Slot — ${totalPrice}</>
                )}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-gray-400 mb-4">Sign in to reserve a billboard slot</p>
          <Link
            href="/login?redirect=/billboard"
            className="px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}
    </div>
  );
}

export default function BillboardPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <BillboardContent />
    </Suspense>
  );
}
