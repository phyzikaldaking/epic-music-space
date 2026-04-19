/**
 * AI Scoring Worker
 *
 * Consumes jobs from the `ems:ai-scoring` BullMQ queue and updates a song's
 * composite EMS score using the OpenAI sentiment analysis + scoring formula.
 *
 * Run as a standalone Node.js process — NOT inside the Next.js app server.
 * Start with: `npx tsx src/workers/aiScoring.ts`
 *
 * NOTE: This file uses server-only packages (bullmq, prisma) and must never
 * be imported by client components or edge routes.
 */
import { Worker } from "bullmq";
import { getRedis } from "../lib/redis";
import { prisma } from "../lib/prisma";
import { analyseSong } from "../lib/ai";
import { calculateAiScore, scoreToDistrict } from "../lib/scoring";
const connection = getRedis();
if (!connection) {
    console.error("[aiScoring-worker] REDIS_URL is not set — worker cannot start");
    process.exit(1);
}
const worker = new Worker("ems:ai-scoring", async (job) => {
    const { songId } = job.data;
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
        throw new Error(`Song not found: ${songId}`);
    }
    // Get AI sentiment from OpenAI
    const analysis = await analyseSong(song.title, song.artist, song.genre, song.description);
    // Compute composite EMS score
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
    await prisma.song.update({
        where: { id: songId },
        data: { aiScore: score, district },
    });
    console.info(`[aiScoring-worker] Song scored: id=${songId} score=${score} district=${district}`);
}, {
    connection,
    concurrency: 5,
});
worker.on("completed", (job) => {
    console.info(`[aiScoring-worker] Job completed: ${job.id}`);
});
worker.on("failed", (job, err) => {
    console.error(`[aiScoring-worker] Job failed: ${job === null || job === void 0 ? void 0 : job.id}`, err.message);
});
console.info("[aiScoring-worker] Started — listening for jobs on ems:ai-scoring");
