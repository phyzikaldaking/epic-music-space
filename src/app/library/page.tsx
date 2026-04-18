"use client";

import { useState } from "react";
import { Plus, Library, Heart, Trash2, ListMusic } from "lucide-react";
import Link from "next/link";
import { usePlaylistStore } from "@/store/playlistStore";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export default function LibraryPage() {
  const { playlists, likedSongs, createPlaylist, deletePlaylist } = usePlaylistStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    createPlaylist(name.trim(), desc.trim());
    setName("");
    setDesc("");
    setCreateOpen(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Library size={24} className="text-purple-400" />
          Your Library
        </h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus size={16} className="mr-1" />
          New Playlist
        </Button>
      </div>

      {/* Liked Songs shortcut */}
      <Link
        href="/liked"
        className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-pink-600/20 to-purple-600/20 border border-pink-500/20 hover:border-pink-500/40 transition-all"
      >
        <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <Heart size={24} className="text-white" fill="white" />
        </div>
        <div>
          <p className="font-semibold text-white">Liked Songs</p>
          <p className="text-sm text-gray-400">{likedSongs.length} songs</p>
        </div>
      </Link>

      {/* Playlists */}
      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ListMusic size={48} className="text-gray-600 mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">No playlists yet</h2>
          <p className="text-gray-400 mb-4">
            Create your first playlist to organize your music
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} className="mr-1" />
            Create Playlist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <div key={playlist.id} className="group relative">
              <Link
                href={`/playlist/${playlist.id}`}
                className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
              >
                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <ListMusic size={20} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{playlist.name}</p>
                  {playlist.description && (
                    <p className="text-xs text-gray-400 truncate">{playlist.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-0.5">
                    {playlist.trackIds.length} songs
                  </p>
                </div>
              </Link>
              <button
                onClick={() => deletePlaylist(playlist.id)}
                className="absolute top-3 right-3 p-1.5 rounded-full text-gray-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                aria-label="Delete playlist"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create playlist modal */}
      <Modal open={createOpen} onOpenChange={setCreateOpen} title="Create Playlist">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-300 block mb-1">Playlist name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Playlist"
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 block mb-1">
              Description{" "}
              <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe your playlist..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
