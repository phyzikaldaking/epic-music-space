import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Track, Playlist } from "@/types/music";

interface PlaylistState {
  playlists: Playlist[];
  likedSongs: Track[];

  createPlaylist: (name: string, description?: string) => Playlist;
  deletePlaylist: (id: string) => void;
  updatePlaylist: (id: string, updates: Partial<Playlist>) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  likeTrack: (track: Track) => void;
  unlikeTrack: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
}

export const usePlaylistStore = create<PlaylistState>()(
  persist(
    (set, get) => ({
      playlists: [],
      likedSongs: [],

      createPlaylist: (name, description = "") => {
        const playlist: Playlist = {
          id: `pl-${Date.now()}`,
          name,
          description,
          trackIds: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({ playlists: [...state.playlists, playlist] }));
        return playlist;
      },

      deletePlaylist: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
        })),

      updatePlaylist: (id, updates) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === id
              ? { ...p, ...updates, updatedAt: new Date().toISOString() }
              : p
          ),
        })),

      addTrackToPlaylist: (playlistId, track) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId && !p.trackIds.includes(track.id)
              ? {
                  ...p,
                  trackIds: [...p.trackIds, track.id],
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      removeTrackFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId
              ? {
                  ...p,
                  trackIds: p.trackIds.filter((id) => id !== trackId),
                  updatedAt: new Date().toISOString(),
                }
              : p
          ),
        })),

      likeTrack: (track) =>
        set((state) => {
          if (state.likedSongs.some((t) => t.id === track.id)) return state;
          return { likedSongs: [...state.likedSongs, track] };
        }),

      unlikeTrack: (trackId) =>
        set((state) => ({
          likedSongs: state.likedSongs.filter((t) => t.id !== trackId),
        })),

      isLiked: (trackId) => get().likedSongs.some((t) => t.id === trackId),
    }),
    {
      name: "epic-music-playlists",
    }
  )
);
