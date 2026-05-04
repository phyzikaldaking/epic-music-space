import { District, Prisma, PrismaClient, Role } from "../generated/client";

const prisma = new PrismaClient();

const demoArtist = {
  email: "demo@epicmusicspace.com",
  name: "EMS Demo Orchestra",
  username: "ems-demo-orchestra",
};

// Demo media is hosted in Supabase Storage. Set DEMO_TRACKS_LOCAL_FALLBACK=1
// while running the seed to keep the legacy /demo/audio/* paths instead.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? "audio";
const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET ?? "covers";
const PREFIX = process.env.SUPABASE_DEMO_PREFIX ?? "demo/legacy";
const USE_LOCAL = process.env.DEMO_TRACKS_LOCAL_FALLBACK === "1";

function audioUrl(filename: string): string {
  if (USE_LOCAL || !SUPABASE_URL) return `/demo/audio/${filename}`;
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${PREFIX}/${filename}`;
}

function coverUrl(filename: string): string {
  if (USE_LOCAL || !SUPABASE_URL) return `/demo/covers/${filename}`;
  return `${SUPABASE_URL}/storage/v1/object/public/${COVERS_BUCKET}/${PREFIX}/${filename}`;
}

const demoTracks = [
  {
    id: "demo-stellar-drift",
    title: "Stellar Drift",
    genre: "Cinematic",
    description:
      "Slow-burn cosmic tension for documentaries, title sequences, and atmospheric game menus.",
    audioUrl: audioUrl("stellar-drift.wav"),
    coverUrl: coverUrl("stellar-drift.svg"),
    bpm: 86,
    key: "A minor",
    licensePrice: "49.00",
    revenueSharePct: "7.50",
    totalLicenses: 100,
    soldLicenses: 12,
    aiScore: 92.4,
    streamCount: 12840,
  },
  {
    id: "demo-orbital-chase",
    title: "Orbital Chase",
    genre: "Trailer",
    description:
      "Percussive sci-fi momentum for launch trailers, highlight reels, and mission reveals.",
    audioUrl: audioUrl("orbital-chase.wav"),
    coverUrl: coverUrl("orbital-chase.svg"),
    bpm: 128,
    key: "C minor",
    licensePrice: "79.00",
    revenueSharePct: "8.00",
    totalLicenses: 75,
    soldLicenses: 21,
    aiScore: 95.1,
    streamCount: 18220,
  },
  {
    id: "demo-nebula-rise",
    title: "Nebula Rise",
    genre: "Ambient",
    description:
      "Hopeful orbital ambience for creator intros, science explainers, and cinematic transitions.",
    audioUrl: audioUrl("nebula-rise.wav"),
    coverUrl: coverUrl("nebula-rise.svg"),
    bpm: 102,
    key: "G minor",
    licensePrice: "59.00",
    revenueSharePct: "6.50",
    totalLicenses: 120,
    soldLicenses: 18,
    aiScore: 89.8,
    streamCount: 9780,
  },
] as const;

async function main() {
  const artist = await prisma.user.upsert({
    where: { email: demoArtist.email },
    create: {
      email: demoArtist.email,
      name: demoArtist.name,
      username: demoArtist.username,
      role: Role.ARTIST,
    },
    update: {
      name: demoArtist.name,
      username: demoArtist.username,
      role: Role.ARTIST,
    },
  });

  await prisma.studio.upsert({
    where: { userId: artist.id },
    create: {
      userId: artist.id,
      username: demoArtist.username,
      bio: "Demo artist profile with cinematic licensing-ready tracks.",
      district: District.INDIE_BLOCKS,
      level: 2,
    },
    update: {
      username: demoArtist.username,
      bio: "Demo artist profile with cinematic licensing-ready tracks.",
      district: District.INDIE_BLOCKS,
      level: 2,
    },
  });

  for (const track of demoTracks) {
    await prisma.song.upsert({
      where: { id: track.id },
      create: {
        id: track.id,
        title: track.title,
        artist: demoArtist.name,
        genre: track.genre,
        description: track.description,
        audioUrl: track.audioUrl,
        coverUrl: track.coverUrl,
        bpm: track.bpm,
        key: track.key,
        licensePrice: new Prisma.Decimal(track.licensePrice),
        revenueSharePct: new Prisma.Decimal(track.revenueSharePct),
        totalLicenses: track.totalLicenses,
        soldLicenses: track.soldLicenses,
        isActive: true,
        aiScore: track.aiScore,
        streamCount: track.streamCount,
        district: District.INDIE_BLOCKS,
        artistId: artist.id,
      },
      update: {
        artist: demoArtist.name,
        genre: track.genre,
        description: track.description,
        audioUrl: track.audioUrl,
        coverUrl: track.coverUrl,
        bpm: track.bpm,
        key: track.key,
        licensePrice: new Prisma.Decimal(track.licensePrice),
        revenueSharePct: new Prisma.Decimal(track.revenueSharePct),
        totalLicenses: track.totalLicenses,
        soldLicenses: track.soldLicenses,
        isActive: true,
        aiScore: track.aiScore,
        streamCount: track.streamCount,
        district: District.INDIE_BLOCKS,
        artistId: artist.id,
      },
    });
  }

  console.log(`Seeded ${demoTracks.length} EMS demo tracks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
