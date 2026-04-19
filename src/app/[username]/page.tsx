"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Profile, SongWithArtist } from "@/types/database";
import { useFollow } from "@/hooks/useFollow";
import { useAuth } from "@/hooks/useAuth";
import { SongCard } from "@/components/feed/SongCard";
import { Music2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [songs, setSongs] = useState<SongWithArtist[]>([]);
  const [loading, setLoading] = useState(true);

  const { following, count: followerCount, toggle: toggleFollow } = useFollow(
    profile?.id ?? "",
    profile?.followers_count ?? 0
  );

  useEffect(() => {
    if (!username) return;
    const supabase = createClient();
    const fetchProfile = async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (prof) {
        const profileData = prof as Profile;
        setProfile(profileData);
        const { data: songData } = await (supabase
          .from("songs")
          .select("*, profiles(*)")
          .eq("artist_id", profileData.id)
          .eq("is_published", true)
          .order("created_at", { ascending: false }) as unknown as Promise<{ data: SongWithArtist[] | null; error: unknown }>);
        setSongs(songData ?? []);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [username]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">User not found</p>
      </div>
    );
  }

  const isOwnProfile = user?.id === profile.id;

  return (
    <div>
      {/* Banner gradient */}
      <div className="h-32 bg-gradient-to-r from-purple-900 via-blue-900 to-pink-900" />

      <div className="px-6 pb-6">
        {/* Avatar + actions */}
        <div className="flex items-end justify-between -mt-12 mb-6">
          <div className="w-24 h-24 rounded-full border-4 border-[#050510] bg-purple-700 flex items-center justify-center text-3xl font-bold text-white shadow-xl overflow-hidden">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={profile.username} fill className="object-cover" unoptimized />
            ) : (
              (profile.display_name ?? profile.username)[0].toUpperCase()
            )}
          </div>

          <div className="flex gap-2 mb-1">
            {isOwnProfile ? (
          <Link href="/settings" className="px-4 py-2 rounded-xl border border-white/20 text-sm text-white hover:bg-white/10 transition-colors">Edit profile</Link>
            ) : user ? (
              <button
                onClick={toggleFollow}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
                  following
                    ? "bg-white/10 border-white/20 text-white hover:bg-red-500/20 hover:border-red-400/40 hover:text-red-300"
                    : "bg-purple-600 border-purple-500 text-white hover:bg-purple-500"
                )}
              >
                {following ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Profile info */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{profile.display_name ?? profile.username}</h1>
          <p className="text-gray-400">@{profile.username}</p>

          {profile.bio && (
            <p className="text-gray-300 text-sm mt-2 max-w-xl">{profile.bio}</p>
          )}

          <div className="flex gap-6 mt-4">
            <div>
              <span className="text-white font-bold">{followerCount.toLocaleString()}</span>
              <span className="text-gray-400 text-sm ml-1">followers</span>
            </div>
            <div>
              <span className="text-white font-bold">{profile.following_count.toLocaleString()}</span>
              <span className="text-gray-400 text-sm ml-1">following</span>
            </div>
            <div>
              <span className="text-white font-bold">{songs.length}</span>
              <span className="text-gray-400 text-sm ml-1">songs</span>
            </div>
          </div>

          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-sm mt-2 w-fit"
            >
              <Globe size={14} />
              {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>

        {/* Songs grid */}
        {songs.length === 0 ? (
          <div className="text-center py-16">
            <Music2 size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No songs uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} queue={songs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
