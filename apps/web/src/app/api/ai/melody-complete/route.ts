import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { openai } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import {
  getRequestId,
  jsonWithRequestId,
  withRequestId,
} from "@/lib/requestTracing";

// Continue a 4-bar melody (#31 in the 50-item AI bucket). The producer
// hands us their existing MIDI notes + the project key/BPM; we ask
// gpt-4o-mini to compose the next 4 bars in the same style and return
// MIDI as JSON. Cheap (~$0.0003 per call) and per-user rate-limited.

export const runtime = "nodejs";

const noteSchema = z.object({
  // Note number 0–127 (C-1 to G9). MIDI standard.
  note: z.number().int().min(0).max(127),
  // Start beat (0-based, fractional ok).
  startBeat: z.number().min(0).max(64),
  // Duration in beats.
  lengthBeats: z.number().min(0.0625).max(16),
  velocity: z.number().min(0).max(1).optional(),
});

const bodySchema = z.object({
  notes: z.array(noteSchema).min(1).max(64),
  bpm: z.number().int().min(40).max(240).optional().default(120),
  key: z.string().max(10).optional(),
});

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`ai:melody-complete:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Slow down — try again in a minute." },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 16 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) return withRequestId(bodyResult.response, requestId);
  const parsed = bodySchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const client = openai;
  if (!client) {
    return jsonWithRequestId(
      requestId,
      { error: "AI is offline." },
      { status: 503 },
    );
  }

  const { notes, bpm, key } = parsed.data;
  const noteSummary = notes
    .map(
      (n) =>
        `n=${n.note},s=${n.startBeat.toFixed(2)},l=${n.lengthBeats.toFixed(2)}`,
    )
    .join(" | ");

  const result = await withRouteTimeout(
    "ai-melody-complete",
    12_000,
    async (signal) => {
      const completion = await client.chat.completions.create(
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a melody completion assistant for music producers. Given a MIDI snippet (notes as {note,startBeat,lengthBeats}), return the NEXT 4 bars in the same style. Stay diatonic to the implied key. Return STRICT JSON: { notes: Array<{ note, startBeat, lengthBeats, velocity? }> }. Use startBeat values offset from 0 (the new section starts at beat 0). No prose, no markdown.",
            },
            {
              role: "user",
              content: `BPM: ${bpm}\nKey: ${key ?? "auto-detect from notes"}\n\nExisting notes (compact): ${noteSummary}\n\nReturn JSON only.`,
            },
          ],
          max_tokens: 600,
          temperature: 0.7,
          response_format: { type: "json_object" },
        },
        { signal },
      );
      const raw = completion.choices[0]?.message?.content ?? "{}";
      try {
        const parsedOut = JSON.parse(raw) as {
          notes?: Array<{
            note?: number;
            startBeat?: number;
            lengthBeats?: number;
            velocity?: number;
          }>;
        };
        const cleanNotes = Array.isArray(parsedOut.notes)
          ? parsedOut.notes
              .filter(
                (n): n is { note: number; startBeat: number; lengthBeats: number; velocity?: number } =>
                  typeof n?.note === "number" &&
                  typeof n?.startBeat === "number" &&
                  typeof n?.lengthBeats === "number",
              )
              .map((n) => ({
                note: Math.max(0, Math.min(127, Math.round(n.note))),
                startBeat: Math.max(0, n.startBeat),
                lengthBeats: Math.max(0.0625, Math.min(16, n.lengthBeats)),
                velocity:
                  typeof n.velocity === "number"
                    ? Math.max(0, Math.min(1, n.velocity))
                    : 0.85,
              }))
              .slice(0, 64)
          : [];
        return { notes: cleanNotes };
      } catch {
        return { notes: [] };
      }
    },
  );
  if (!result.ok) return withRequestId(result.response, requestId);

  return jsonWithRequestId(requestId, result.value);
}
