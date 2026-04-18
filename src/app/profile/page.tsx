"use client";

import { User, Music2, Heart, ListMusic } from "lucide-react";
import { usePlaylistStore } from "@/store/playlistStore";
import { formatDuration } from "@/lib/api";

export default function ProfilePage() {
  const { playlists, likedSongs } = usePlaylistStore();
  const totalLikedDuration = likedSongs.reduce((sum, t) => sum + t.duration, 0);

  const mockUser = {
    name: "Cosmic Explorer",
    email: "explorer@epicmusic.space",
    joinedDate: "January 2024",
    avatar: "🚀",
  };

  return (
    <div className="p-6 space-y-8">
      {/* Profile header */}
      <div className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-4xl shadow-xl shadow-purple-500/20 flex-shrink-0">
          {mockUser.avatar}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Profile</p>
          <h1 className="text-3xl font-bold text-white">{mockUser.name}</h1>
          <p className="text-gray-400">{mockUser.email}</p>
          <p className="text-sm text-gray-500 mt-1">Member since {mockUser.joinedDate}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 text-center">
          <ListMusic size={24} className="text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{playlists.length}</p>
          <p className="text-sm text-gray-400">Playlists</p>
        </div>
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 text-center">
          <Heart size={24} className="text-pink-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{likedSongs.length}</p>
          <p className="text-sm text-gray-400">Liked Songs</p>
        </div>
        <div className="p-5 rounded-xl bg-white/5 border border-white/10 text-center col-span-2 md:col-span-1">
          <Music2 size={24} className="text-blue-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{formatDuration(totalLikedDuration)}</p>
          <p className="text-sm text-gray-400">Liked Duration</p>
        </div>
      </div>

      {/* Currently listening */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <User size={18} className="text-purple-400" />
          <h2 className="font-semibold text-white">Account</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Username</span>
            <span className="text-white">{mockUser.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Email</span>
            <span className="text-white">{mockUser.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Member since</span>
            <span className="text-white">{mockUser.joinedDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Plan</span>
            <span className="text-purple-300 font-medium">🚀 Cosmic Free</span>
          </div>
        </div>
      </div>
    </div>
  );
}
