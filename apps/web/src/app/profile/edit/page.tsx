"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface ProfileData {
  name: string | null;
  image: string | null;
  email: string;
  role: string;
  studio?: { bio: string | null; username: string } | null;
}

export default function ProfileEditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("type", "cover");
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Upload failed."); return; }
      setImageUrl(data.url ?? "");
    } catch {
      setError("Upload failed. Paste a URL instead.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => {
        if (r.status === 401) {
          router.push("/auth/signin?callbackUrl=/profile/edit");
          return null;
        }
        return r.json() as Promise<ProfileData>;
      })
      .then((data) => {
        if (!data) return;
        setName(data.name ?? "");
        setImageUrl(data.image ?? "");
        setEmail(data.email ?? "");
        setRole(data.role ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load profile.");
        setLoading(false);
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const body: Record<string, string> = {};
    if (name.trim()) body.name = name.trim();
    if (imageUrl.trim()) body.image = imageUrl.trim();

    if (Object.keys(body).length === 0) {
      setError("No changes to save.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to save.");
        setSaving(false);
        return;
      }

      setSuccess(true);
      // Reload session-dependent UI after a short delay
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm text-white/40 hover:text-white transition"
      >
        ← Back
      </button>

      <h1 className="mb-1 text-3xl font-extrabold">
        <span className="text-gradient-ems">Edit Profile</span>
      </h1>
      <p className="mb-8 text-sm text-white/40">
        Update your display name and avatar.
      </p>

      {/* Current avatar preview */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/15 bg-brand-500/20 flex items-center justify-center text-2xl flex-shrink-0">
          {imageUrl ? (
            <Image src={imageUrl} alt="Avatar" fill className="object-cover" sizes="64px" unoptimized />
          ) : (
            <span>{name?.[0]?.toUpperCase() ?? "?"}</span>
          )}
        </div>
        <div>
          <p className="font-semibold">{name || "(no name)"}</p>
          <p className="text-xs text-white/40">{email}</p>
          <span className="mt-1 inline-block rounded-full bg-brand-500/20 px-2 py-0.5 text-xs text-brand-400">
            {role}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          ✅ Profile updated! Redirecting to dashboard…
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Display name */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Your display name"
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
        </div>

        {/* Avatar upload */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-white/40">
            Avatar
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            aria-label="Upload avatar image"
            className="hidden"
            onChange={handleAvatarFile}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm text-white/70 transition hover:border-brand-500/50 hover:text-white disabled:opacity-50"
          >
            {uploading ? (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <span>📁</span>
            )}
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
            className="w-full rounded-xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-white placeholder-white/25 transition focus:border-brand-500/60 focus:outline-none focus:ring-1 focus:ring-brand-500/40"
          />
          <p className="mt-1 text-xs text-white/25">
            Upload a file or paste a direct image URL.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-500 py-3 font-bold text-white transition hover:bg-brand-600 disabled:opacity-50 glow-purple-sm"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Changes"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-white/20">
        Email and role cannot be changed here. Contact support for account changes.
      </p>
    </div>
  );
}
