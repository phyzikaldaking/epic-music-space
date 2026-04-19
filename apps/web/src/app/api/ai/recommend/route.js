import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recommendSongs } from "@/lib/ai";
export async function GET() {
    var _a;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Songs user already holds licenses for
    const userLicenses = await prisma.licenseToken.findMany({
        where: { holderId: session.user.id, status: "ACTIVE" },
        include: { song: { select: { title: true, id: true } } },
    });
    const ownedTitles = userLicenses.map((l) => l.song.title);
    const ownedSongIds = userLicenses.map((l) => l.song.id);
    // Songs user does NOT already have, with licenses still available
    const candidates = await prisma.song.findMany({
        where: {
            isActive: true,
            id: { notIn: ownedSongIds },
        },
        select: { id: true, title: true, artist: true, genre: true, soldLicenses: true, totalLicenses: true },
        orderBy: { aiScore: "desc" },
        take: 50,
    });
    // Filter to only songs with availability
    const available = candidates
        .filter((s) => s.soldLicenses < s.totalLicenses)
        .slice(0, 30);
    const recommendations = await recommendSongs(ownedTitles, available);
    // Enrich with full song data
    const enriched = await Promise.all(recommendations.map(async (r) => {
        const song = await prisma.song.findUnique({ where: { id: r.songId } });
        return Object.assign(Object.assign({}, r), { song });
    }));
    return NextResponse.json(enriched.filter((r) => r.song !== null));
}
