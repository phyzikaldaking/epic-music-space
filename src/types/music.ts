export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  albumArt: string;
  duration: number; // seconds
  previewUrl: string | null;
  genre: string;
  year: number;
}

export interface Artist {
  id: string;
  name: string;
  image: string;
  bio: string;
  genres: string[];
  monthlyListeners: number;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  artist: string;
  releaseDate: string;
  coverArt: string;
  trackIds: string[];
  genre: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  coverArt?: string;
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type RepeatMode = "none" | "one" | "all";
