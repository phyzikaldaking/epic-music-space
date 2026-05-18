import { prisma } from "@/lib/prisma";
import { normalizeArtistHandle } from "@/lib/artistRoutes";

export async function findArtistByHandle(handle: string) {
  const clean = normalizeArtistHandle(handle);

  return prisma.user.findFirst({
    where: {
      OR: [
        { username: clean },
        { studio: { username: clean } },
        { name: { equals: clean, mode: "insensitive" } },
      ],
      role: { in: ["ARTIST", "PRODUCER", "ENGINEER", "LABEL", "ADMIN"] },
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      studio: { select: { username: true } },
    },
  });
}

export async function requireArtistByHandle(handle: string) {
  const artist = await findArtistByHandle(handle);

  if (!artist) {
    throw new Error("ARTIST_NOT_FOUND");
  }

  return artist;
}
