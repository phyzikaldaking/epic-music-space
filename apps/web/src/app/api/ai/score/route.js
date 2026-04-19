import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyseSong } from "@/lib/ai";
import { calculateAiScore, scoreToDistrict } from "@/lib/scoring";
import { z } from "zod";
const schema = z.object({ songId: z.string().cuid() });
export async function POST(req) {
    var _a;
    const session = await auth();
    if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
    }
    const song = await prisma.song.findUnique({ where: { id: parsed.data.songId } });
    if (!song) {
        return NextResponse.json({ error: "Song not found" }, { status: 404 });
    }
    // Get AI sentiment
    const analysis = await analyseSong(song.title, song.artist, song.genre, song.description);
    // Compute composite score
    const score = calculateAiScore({
        soldLicenses: song.soldLicenses,
        totalLicenses: song.totalLicenses,
        streamCount: song.streamCount,
        versusWins: song.versusWins,
        versusLosses: song.versusLosses,
        aiSentiment: analysis.sentiment,
        createdAt: song.createdAt,
    });
    const district = scoreToDistrict(score);
    // Persist updated score + district
    await prisma.song.update({
        where: { id: song.id },
        data: { aiScore: score, district },
    });
    return NextResponse.json({ score, district, analysis });
}
