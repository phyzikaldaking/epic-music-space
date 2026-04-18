"use client";

import { notFound } from "next/navigation";
import { use, useState } from "react";
import { Play, Pencil, Trash2, ListMusic } from "lucide-react";
import { usePlaylistStore } from "@/store/playlistStore";
import { usePlayerStore } from "@/store/playerStore";
import { TrackRow } from "@/components/ui/TrackRow";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getTrackById } from "@/data/mockData";

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { playlists, updatePlaylist, deletePlaylist } = usePlaylistStore();
  const { playTrack } = usePlayerStore();

  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) notFound();

  const playlistTracks = playlist.trackIds
    .map(getTrackById)
    .filter(Boolean) as NonNullable<ReturnType<typeof getTrackById>>[];

  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(playlist.name);
  const [desc, setDesc] = useState(playlist.description);

  const handleSave = () => {
    updatePlaylist(id, { name, description: desc });
    setEditOpen(false);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="p-6 flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-48 h-48 flex-shrink-0 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-2xl shadow-purple-500/20">
          <ListMusic size={64} className="text-white opacity-70" />
        </div>
        <div className="flex flex-col justify-end">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Playlist</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-1">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="text-gray-400 mb-2">{playlist.description}</p>
          )}
          <p className="text-sm text-gray-500 mb-4">{playlistTracks.length} songs</p>
          <div className="flex items-center gap-3">
            {playlistTracks.length > 0 && (
              <Button
                onClick={() => playTrack(playlistTracks[0], playlistTracks)}
              >
                <Play size={16} className="mr-1" fill="white" />
                Play
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={14} className="mr-1" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Tracks */}
      <div className="px-6">
        {playlistTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ListMusic size={40} className="text-gray-600 mb-3" />
            <p className="text-gray-400">This playlist is empty</p>
            <p className="text-sm text-gray-500 mt-1">
              Add songs from the search or browse pages
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            {playlistTracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                queue={playlistTracks}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} onOpenChange={setEditOpen} title="Edit Playlist">
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-300 block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-sm text-gray-300 block mb-1">Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
            />
          </div>
          <div className="flex justify-between">
            <Button
              variant="danger"
              onClick={() => {
                deletePlaylist(id);
                window.location.href = "/library";
              }}
            >
              <Trash2 size={14} className="mr-1" />
              Delete Playlist
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
