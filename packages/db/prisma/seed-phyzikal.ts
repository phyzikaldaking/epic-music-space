import { District, Prisma, PrismaClient, Role } from "../generated/client";

const prisma = new PrismaClient();

const artistProfile = {
  email: "phyzikaldaking@gmail.com",
  name: "PHYZIKAL DA KING",
  username: "phyzikaldaking",
};

const tracks = [
  ["back-then-drunk", "Back Then Drunk", "/audio/back-then-drunk.wav", "49.99", 100, 12],
  ["bankston-brothers", "Bankston Brothers", "/audio/bankston-brothers.wav", "59.99", 96.5, 8],
  ["bodega", "Bodega", "/audio/bodega.wav", "49.99", 93, 6],
  ["clear-the-record", "Clear The Record", "/audio/clear-the-record.wav", "54.99", 89.5, 4],
  ["dog-food", "Dog Food", "/audio/dog-food.wav", "69.99", 86, 4],
  ["pay-like-you-weigh", "Pay Like You Weigh", "/audio/pay-like-you-weigh.wav", "69.99", 82.5, 4],
] as const;

async function main() {
  await prisma.song.deleteMany({
    where: { id: { in: ["demo-stellar-drift", "demo-orbital-chase", "demo-nebula-rise"] } },
  });

  const artist = await prisma.user.upsert({
    where: { email: artistProfile.email },
    create: {
      email: artistProfile.email,
      name: artistProfile.name,
      username: artistProfile.username,
      role: Role.ARTIST,
    },
    update: {
      name: artistProfile.name,
      username: artistProfile.username,
      role: Role.ARTIST,
    },
  });

  await prisma.studio.upsert({
    where: { userId: artist.id },
    create: {
      userId: artist.id,
      username: artistProfile.username,
      bio: "Official Epic Music Space launch studio for PHYZIKAL DA KING.",
      district: District.DOWNTOWN_PRIME,
      level: 5,
    },
    update: {
      username: artistProfile.username,
      bio: "Official Epic Music Space launch studio for PHYZIKAL DA KING.",
      district: District.DOWNTOWN_PRIME,
      level: 5,
    },
  });

  for (const [id, title, audioUrl, licensePrice, aiScore, boostScore] of tracks) {
    await prisma.song.upsert({
      where: { id },
      create: {
        id,
        title,
        artist: artistProfile.name,
        genre: "Hip-Hop",
        description: "Original PHYZIKAL DA KING beat for the Epic Music Space launch catalog.",
        audioUrl,
        coverUrl: `/covers/${id}.svg`,
        licensePrice: new Prisma.Decimal(licensePrice),
        revenueSharePct: new Prisma.Decimal("50.00"),
        totalLicenses: 100,
        soldLicenses: 0,
        isActive: true,
        aiScore,
        boostScore,
        streamCount: 0,
        district: District.DOWNTOWN_PRIME,
        artistId: artist.id,
      },
      update: {
        title,
        artist: artistProfile.name,
        genre: "Hip-Hop",
        description: "Original PHYZIKAL DA KING beat for the Epic Music Space launch catalog.",
        audioUrl,
        coverUrl: `/covers/${id}.svg`,
        licensePrice: new Prisma.Decimal(licensePrice),
        revenueSharePct: new Prisma.Decimal("50.00"),
        totalLicenses: 100,
        soldLicenses: 0,
        isActive: true,
        aiScore,
        boostScore,
        streamCount: 0,
        district: District.DOWNTOWN_PRIME,
        artistId: artist.id,
      },
    });
  }

  console.log(`Seeded ${tracks.length} PHYZIKAL DA KING tracks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
