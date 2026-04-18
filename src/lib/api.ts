import {
  tracks,
  artists,
  albums,
  genres,
  getTracksByArtist,
  getAlbumsByArtist,
  getTracksByAlbum,
} from "@/data/mockData";
import type { Track, Artist, Album } from "@/types/music";

export function getFeaturedTracks(): Track[] {
  return tracks.slice(0, 6);
}

export function getTrendingTracks(): Track[] {
  return [...tracks].sort(() => Math.random() - 0.5).slice(0, 8);
}

export function getNewReleases(): Album[] {
  return albums.slice(0, 4);
}

export function getGenres() {
  return genres;
}

export function searchTracks(query: string): Track[] {
  const q = query.toLowerCase();
  return tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
  );
}

export function searchArtists(query: string): Artist[] {
  const q = query.toLowerCase();
  return artists.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.genres.some((g) => g.toLowerCase().includes(q))
  );
}

export function searchAlbums(query: string): Album[] {
  const q = query.toLowerCase();
  return albums.filter(
    (al) =>
      al.title.toLowerCase().includes(q) ||
      al.artist.toLowerCase().includes(q) ||
      al.genre.toLowerCase().includes(q)
  );
}

export function getArtist(id: string): Artist | undefined {
  return artists.find((a) => a.id === id);
}

export function getArtistTracks(id: string): Track[] {
  return getTracksByArtist(id);
}

export function getArtistAlbums(id: string): Album[] {
  return getAlbumsByArtist(id);
}

export function getAlbum(id: string): Album | undefined {
  return albums.find((al) => al.id === id);
}

export function getAlbumTracks(id: string): Track[] {
  return getTracksByAlbum(id);
}

export function getRecommendations(trackId: string): Track[] {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return tracks.slice(0, 5);
  return tracks
    .filter((t) => t.id !== trackId && t.genre === track.genre)
    .slice(0, 5);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatListeners(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return n.toString();
}
