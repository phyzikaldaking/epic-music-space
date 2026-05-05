import { unstable_cache } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase";

export type DemoTrack = {
  id: string;
  title: string;
  artist: string;
  genre: string | null;
  audioUrl: string;
  coverUrl: string | null;
  bpm: number | null;
  key: string | null;
  licensePrice: string;
  revenueSharePct: string;
  totalLicenses: number;
  soldLicenses: number;
  aiScore: number;
  description: string | null;
};

type TrackSeed = Omit<DemoTrack, "id" | "audioUrl" | "coverUrl"> & {
  fileName: string;
};

const TRACK_SEEDS: TrackSeed[] = [
  {
    fileName: "back then drunk.wav",
    title: "Back Then Drunk",
    artist: "Phyzikal",
    genre: "Street Soul",
    bpm: 92,
    key: "F minor",
    licensePrice: "69.00",
    revenueSharePct: "8.50",
    totalLicenses: 100,
    soldLicenses: 14,
    aiScore: 93.4,
    description: "Late-night confession energy with a heavy pocket and enough space for real talk verses.",
  },
  {
    fileName: "bankston brothers.wav",
    title: "Bankston Brothers",
    artist: "Phyzikal",
    genre: "Southern Pressure",
    bpm: 96,
    key: "D minor",
    licensePrice: "79.00",
    revenueSharePct: "9.00",
    totalLicenses: 80,
    soldLicenses: 22,
    aiScore: 95.8,
    description: "Tight drums and hometown swagger built for statement records and crew anthems.",
  },
  {
    fileName: "bodega.wav",
    title: "Bodega",
    artist: "Phyzikal",
    genre: "Corner Rap",
    bpm: 98,
    key: "G minor",
    licensePrice: "74.00",
    revenueSharePct: "8.75",
    totalLicenses: 90,
    soldLicenses: 19,
    aiScore: 94.6,
    description: "Dusty chops and fast hands energy for records that need block texture and motion.",
  },
  {
    fileName: "clear the record.wav",
    title: "Clear the Record",
    artist: "Phyzikal",
    genre: "Courtroom Grit",
    bpm: 88,
    key: "A minor",
    licensePrice: "72.00",
    revenueSharePct: "8.25",
    totalLicenses: 95,
    soldLicenses: 11,
    aiScore: 91.9,
    description: "Measured tension for confessionals, response tracks, and records with something to prove.",
  },
  {
    fileName: "dog food.wav",
    title: "Dog Food",
    artist: "Phyzikal",
    genre: "Raw Trap",
    bpm: 144,
    key: "E minor",
    licensePrice: "84.00",
    revenueSharePct: "9.25",
    totalLicenses: 70,
    soldLicenses: 27,
    aiScore: 96.2,
    description: "Aggressive low end and hard percussion for records that need bite from the first bar.",
  },
  {
    fileName: "pay like you weigh.wav",
    title: "Pay Like You Weigh",
    artist: "Phyzikal",
    genre: "Player Music",
    bpm: 100,
    key: "C minor",
    licensePrice: "76.00",
    revenueSharePct: "8.60",
    totalLicenses: 85,
    soldLicenses: 16,
    aiScore: 94.1,
    description: "Confident bounce with talking-room space for hustler hooks and sharp punch-ins.",
  },
];

const trackSeedByFileName = new Map(
  TRACK_SEEDS.map((track) => [track.fileName.toLowerCase(), track]),
);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPublicUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return "";
  return `${baseUrl}/storage/v1/object/public/audio/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

/** Local /public fallback — used when the Supabase bucket is empty or unavailable. */
function buildLocalUrl(seed: TrackSeed): string {
  return `/demo/audio/${slugify(seed.fileName)}.wav`;
}

function toDemoTrack(seed: TrackSeed, path: string): DemoTrack {
  return {
    id: `demo-${slugify(seed.title)}`,
    title: seed.title,
    artist: seed.artist,
    genre: seed.genre,
    audioUrl: buildPublicUrl(path) || buildLocalUrl(seed),
    coverUrl: null,
    bpm: seed.bpm,
    key: seed.key,
    licensePrice: seed.licensePrice,
    revenueSharePct: seed.revenueSharePct,
    totalLicenses: seed.totalLicenses,
    soldLicenses: seed.soldLicenses,
    aiScore: seed.aiScore,
    description: seed.description,
  };
}

async function listAudioFiles(prefix = ""): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [] as string[];

  const { data, error } = await supabase.storage.from("audio").list(prefix, {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (error || !data) return [];

  const nested = await Promise.all(
    data
      .filter((item) => item.metadata == null)
      .map((folder) => listAudioFiles(prefix ? `${prefix}/${folder.name}` : folder.name)),
  );

  const files = data
    .filter((item) => item.metadata != null)
    .map((item) => (prefix ? `${prefix}/${item.name}` : item.name));

  return [...files, ...nested.flat()];
}

const getCachedDemoTracks = unstable_cache(
  async (): Promise<DemoTrack[]> => {
    const audioPaths = await listAudioFiles();
    const matchedTracks = audioPaths
      .map((path) => {
        const fileName = path.split("/").pop()?.toLowerCase() ?? "";
        const seed = trackSeedByFileName.get(fileName);
        return seed ? toDemoTrack(seed, path) : null;
      })
      .filter((track): track is DemoTrack => Boolean(track));

    if (matchedTracks.length > 0) return matchedTracks;

    return TRACK_SEEDS.map((seed) => toDemoTrack(seed, seed.fileName));
  },
  ["supabase-demo-tracks-v1"],
  { revalidate: 300 },
);

export async function getDemoTracks() {
  return getCachedDemoTracks();
}
