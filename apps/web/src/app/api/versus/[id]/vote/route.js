import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateAiScore, scoreToDistrict } from "@/lib/scoring";
import { moderateLimiter } from "@/lib/rateLimit";
import { enqueueAnalytics } from "@/lib/queues";
const voteSchema = z.object({
    votedSongId: z.string().cuid(),
});
export async function POST(req, { params }) {
    var _a, _b, _c, _d, _e;
    const ip = (_d = (_c = (_b = (_a = req.headers.get("x-forwarded-for")) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : req.headers.get("x-real-ip")) !== null && _d !== void 0 ? _d : "unknown";
    try {
        await moderateLimiter.consume(ip);
    }
    catch (_f) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const session = await auth();
    if (!((_e = session === null || session === void 0 ? void 0 : session.user) === null || _e === void 0 ? void 0 : _e.id)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id: matchId } = await params;
    const body = await req.json();
    const parsed = voteSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid votedSongId" }, { status: 400 });
    }
    const { votedSongId } = parsed.data;
    const match = await prisma.versusMatch.findUnique({ where: { id: matchId } });
    if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    if (match.status === "COMPLETED") {
        return NextResponse.json({ error: "This match has ended." }, { status: 409 });
    }
    if (match.endsAt < new Date()) {
        // Auto-close the match
        await prisma.versusMatch.update({
            where: { id: matchId },
            data: { status: "COMPLETED" },
        });
        return NextResponse.json({ error: "This match has ended." }, { status: 409 });
    }
    if (votedSongId !== match.songAId && votedSongId !== match.songBId) {
        return NextResponse.json({ error: "votedSongId must be one of the two songs in this match." }, { status: 400 });
    }
    // Upsert vote (users can change their vote)
    await prisma.versusVote.upsert({
        where: { matchId_userId: { matchId, userId: session.user.id } },
        create: { matchId, userId: session.user.id, votedSongId },
        update: { votedSongId },
    });
    // Recount votes
    const [votesA, votesB] = await Promise.all([
        prisma.versusVote.count({ where: { matchId, votedSongId: match.songAId } }),
        prisma.versusVote.count({ where: { matchId, votedSongId: match.songBId } }),
    ]);
    const updated = await prisma.versusMatch.update({
        where: { id: matchId },
        data: { votesA, votesB },
    });
    // Update AI scores for both songs after vote change
    const [songA, songB] = await Promise.all([
        prisma.song.findUnique({ where: { id: match.songAId } }),
        prisma.song.findUnique({ where: { id: match.songBId } }),
    ]);
    if (songA) {
        const score = calculateAiScore({
            soldLicenses: songA.soldLicenses,
            totalLicenses: songA.totalLicenses,
            streamCount: songA.streamCount,
            versusWins: songA.versusWins,
            versusLosses: songA.versusLosses,
            aiSentiment: 0.5,
            createdAt: songA.createdAt,
        });
        await prisma.song.update({
            where: { id: match.songAId },
            data: { aiScore: score, district: scoreToDistrict(score) },
        });
    }
    if (songB) {
        const score = calculateAiScore({
            soldLicenses: songB.soldLicenses,
            totalLicenses: songB.totalLicenses,
            streamCount: songB.streamCount,
            versusWins: songB.versusWins,
            versusLosses: songB.versusLosses,
            aiSentiment: 0.5,
            createdAt: songB.createdAt,
        });
        await prisma.song.update({
            where: { id: match.songBId },
            data: { aiScore: score, district: scoreToDistrict(score) },
        });
    }
    // Track vote event
    await enqueueAnalytics({
        event: "versus_vote",
        userId: session.user.id,
        songId: votedSongId,
        metadata: { matchId },
        timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ votesA: updated.votesA, votesB: updated.votesB });
}
