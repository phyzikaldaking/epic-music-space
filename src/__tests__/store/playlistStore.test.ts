import { usePlaylistStore } from "@/store/playlistStore";
import { Track } from "@/types/music";

const mockTrack: Track = {
  id: "t1",
  title: "Test Track",
  artist: "Test Artist",
  artistId: "a1",
  album: "Test Album",
  albumId: "al1",
  albumArt: "https://example.com/art.jpg",
  duration: 180,
  previewUrl: null,
  genre: "Electronic",
  year: 2024,
};

// Mock localStorage for zustand persist
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("playlistStore", () => {
  beforeEach(() => {
    localStorageMock.clear();
    usePlaylistStore.setState({ playlists: [], likedSongs: [] });
  });

  it("creates a playlist", () => {
    usePlaylistStore.getState().createPlaylist("My Playlist", "A cool playlist");
    const { playlists } = usePlaylistStore.getState();
    expect(playlists).toHaveLength(1);
    expect(playlists[0].name).toBe("My Playlist");
    expect(playlists[0].description).toBe("A cool playlist");
    expect(playlists[0].trackIds).toHaveLength(0);
  });

  it("deletes a playlist", () => {
    const p = usePlaylistStore.getState().createPlaylist("To Delete");
    usePlaylistStore.getState().deletePlaylist(p.id);
    expect(usePlaylistStore.getState().playlists).toHaveLength(0);
  });

  it("updates a playlist", () => {
    const p = usePlaylistStore.getState().createPlaylist("Old Name");
    usePlaylistStore.getState().updatePlaylist(p.id, { name: "New Name" });
    expect(usePlaylistStore.getState().playlists[0].name).toBe("New Name");
  });

  it("adds a track to a playlist", () => {
    const p = usePlaylistStore.getState().createPlaylist("Playlist");
    usePlaylistStore.getState().addTrackToPlaylist(p.id, mockTrack);
    expect(usePlaylistStore.getState().playlists[0].trackIds).toContain("t1");
  });

  it("does not add duplicate tracks to playlist", () => {
    const p = usePlaylistStore.getState().createPlaylist("Playlist");
    usePlaylistStore.getState().addTrackToPlaylist(p.id, mockTrack);
    usePlaylistStore.getState().addTrackToPlaylist(p.id, mockTrack);
    expect(usePlaylistStore.getState().playlists[0].trackIds).toHaveLength(1);
  });

  it("removes a track from a playlist", () => {
    const p = usePlaylistStore.getState().createPlaylist("Playlist");
    usePlaylistStore.getState().addTrackToPlaylist(p.id, mockTrack);
    usePlaylistStore.getState().removeTrackFromPlaylist(p.id, "t1");
    expect(usePlaylistStore.getState().playlists[0].trackIds).toHaveLength(0);
  });

  it("likes a track", () => {
    usePlaylistStore.getState().likeTrack(mockTrack);
    expect(usePlaylistStore.getState().likedSongs).toHaveLength(1);
    expect(usePlaylistStore.getState().isLiked("t1")).toBe(true);
  });

  it("does not duplicate liked tracks", () => {
    usePlaylistStore.getState().likeTrack(mockTrack);
    usePlaylistStore.getState().likeTrack(mockTrack);
    expect(usePlaylistStore.getState().likedSongs).toHaveLength(1);
  });

  it("unlikes a track", () => {
    usePlaylistStore.getState().likeTrack(mockTrack);
    usePlaylistStore.getState().unlikeTrack("t1");
    expect(usePlaylistStore.getState().likedSongs).toHaveLength(0);
    expect(usePlaylistStore.getState().isLiked("t1")).toBe(false);
  });
});
