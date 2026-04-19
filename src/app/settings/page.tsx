"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.push("/login?redirect=/settings");
      return;
    }
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setWebsite(profile.website ?? "");
      setAvatarPreview(profile.avatar_url ?? null);
    }
  }, [user, profile, router]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setSuccess(false);
    setSaving(true);

    const supabase = createClient();

    // Upload new avatar if changed
    let avatarUrl: string | undefined;
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true, cacheControl: "3600" });

      if (uploadErr) {
        setError(uploadErr.message);
        setSaving(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      avatarUrl = publicUrl;
    }

    // Check username uniqueness if changed
    if (username !== profile?.username) {
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .single();

      if (existing) {
        setError("Username is already taken");
        setSaving(false);
        return;
      }
    }

    const updates: {
      display_name?: string;
      username?: string;
      bio?: string;
      website?: string;
      avatar_url?: string;
    } = {};

    if (displayName) updates.display_name = displayName;
    if (username) updates.username = username;
    if (bio) updates.bio = bio;
    if (website) updates.website = website;
    if (avatarUrl) updates.avatar_url = avatarUrl;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSuccess(true);
    setSaving(false);

    setTimeout(() => setSuccess(false), 3000);
  };

  if (!user) return null;

  return (
    <div className="max-w-xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Account Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Update your profile information</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
            <CheckCircle size={16} />
            Profile updated successfully
          </div>
        )}

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="relative w-20 h-20 rounded-full overflow-hidden bg-purple-700 flex items-center justify-center group"
          >
            {avatarPreview ? (
              <Image
                src={avatarPreview}
                alt="Avatar"
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <span className="text-2xl font-bold text-white">
                {(displayName || username || "?")[0].toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <div>
            <p className="text-white text-sm font-medium">Profile photo</p>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="text-purple-400 hover:text-purple-300 text-sm mt-1 transition-colors"
            >
              Change photo
            </button>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={60}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Username */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Username</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              required
              minLength={3}
              maxLength={30}
              placeholder="yourhandle"
              className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">Letters, numbers, underscores only</p>
        </div>

        {/* Bio */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Tell the world about yourself…"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
          />
          <p className="text-xs text-gray-600 mt-1 text-right">{bio.length}/200</p>
        </div>

        {/* Website */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yoursite.com"
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="text-sm text-gray-300 block mb-1">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-600 mt-1">Email cannot be changed here</p>
        </div>

        <button
          type="submit"
          disabled={saving || !username.trim()}
          className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </form>
    </div>
  );
}
