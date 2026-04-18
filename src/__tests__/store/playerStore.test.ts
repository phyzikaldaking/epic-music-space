import { usePlayerStore } from "@/store/playerStore";
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

const mockTrack2: Track = { ...mockTrack, id: "t2", title: "Track 2" };

describe("playerStore", () => {
  beforeEach(() => {
    usePlayerStore.setState({
      currentTrack: null,
      queue: [],
      queueIndex: 0,
      isPlaying: false,
      volume: 0.8,
      progress: 0,
      duration: 0,
      shuffle: false,
      repeat: "none",
      showQueue: false,
    });
  });

  it("plays a track", () => {
    usePlayerStore.getState().playTrack(mockTrack);
    const state = usePlayerStore.getState();
    expect(state.currentTrack).toEqual(mockTrack);
    expect(state.isPlaying).toBe(true);
  });

  it("plays a track with queue", () => {
    const queue = [mockTrack, mockTrack2];
    usePlayerStore.getState().playTrack(mockTrack, queue);
    const state = usePlayerStore.getState();
    expect(state.queue).toEqual(queue);
    expect(state.queueIndex).toBe(0);
  });

  it("toggles play/pause", () => {
    usePlayerStore.getState().playTrack(mockTrack);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    usePlayerStore.getState().togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it("advances to next track", () => {
    usePlayerStore.getState().playTrack(mockTrack, [mockTrack, mockTrack2]);
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().currentTrack?.id).toBe("t2");
    expect(usePlayerStore.getState().queueIndex).toBe(1);
  });

  it("goes back to prev track", () => {
    usePlayerStore.setState({ queue: [mockTrack, mockTrack2], queueIndex: 1, currentTrack: mockTrack2, progress: 0 });
    usePlayerStore.getState().prev();
    expect(usePlayerStore.getState().currentTrack?.id).toBe("t1");
  });

  it("sets volume", () => {
    usePlayerStore.getState().setVolume(0.5);
    expect(usePlayerStore.getState().volume).toBe(0.5);
  });

  it("toggles shuffle", () => {
    expect(usePlayerStore.getState().shuffle).toBe(false);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(true);
  });

  it("cycles repeat modes", () => {
    expect(usePlayerStore.getState().repeat).toBe("none");
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("all");
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("one");
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe("none");
  });

  it("adds to queue", () => {
    usePlayerStore.getState().addToQueue(mockTrack);
    usePlayerStore.getState().addToQueue(mockTrack2);
    expect(usePlayerStore.getState().queue).toHaveLength(2);
  });
});
