import { z } from "zod";

export const studioContextSchema = z
  .object({
    route: z.string().max(120).optional().default(""),
    bpm: z.number().min(20).max(300).nullable().optional(),
    trackCount: z.number().int().min(0).max(64).optional().default(0),
    armedTracks: z.number().int().min(0).max(64).optional().default(0),
    hasRecordedAudio: z.boolean().optional().default(false),
    beatKit: z.string().max(40).nullable().optional(),
    beatEnabled: z.boolean().optional().default(false),
    /** Compact beat pattern fingerprint (#E32). Per-lane 16-bit hex
     *  mask where bit 0 = step 0. Lets the AI Coach reason about
     *  specific hits ("your hat fires every 8th — try a ghost snare
     *  on 11") without us sending 8×16 booleans. */
    beatPatternHex: z.string().max(200).nullable().optional(),
    selectedTrackName: z.string().max(80).nullable().optional(),
    lastAction: z.string().max(240).nullable().optional(),
    guestMode: z.boolean().optional().default(false),
    projectKey: z.string().max(10).nullable().optional(),
  })
  .strict()
  .optional();

export const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
  studioContext: studioContextSchema,
});

export function buildStudioPromptSuffix(
  ctx: NonNullable<z.infer<typeof studioContextSchema>>,
): string {
  const lines = [`The user is in the EMS Studio at ${ctx.route || "/studio"}.`];
  const session: string[] = [];
  if (ctx.bpm != null) session.push(`BPM ${ctx.bpm}`);
  if (ctx.beatKit) session.push(`kit ${ctx.beatKit}`);
  if (ctx.projectKey) session.push(`key ${ctx.projectKey}`);
  session.push(`beat machine ${ctx.beatEnabled ? "ON" : "OFF"}`);
  if (session.length > 0) lines.push(`Session: ${session.join(", ")}.`);
  lines.push(
    `Tracks: ${ctx.trackCount} (${ctx.armedTracks} armed). Recorded audio: ${ctx.hasRecordedAudio ? "yes" : "no"}.`,
  );
  if (ctx.selectedTrackName) lines.push(`Selected: "${ctx.selectedTrackName}".`);
  if (ctx.lastAction) lines.push(`Last action: ${ctx.lastAction}.`);
  if (ctx.beatPatternHex) {
    // Format: "kick:9001 snare:1010 hat:5555 ..." — each lane is a
    // 4-char hex mask of the 16-step grid (LSB = step 0). Lets the
    // model spot density / syncopation without seeing the full grid.
    lines.push(`Current pattern (16-bit hex per lane): ${ctx.beatPatternHex}.`);
  }
  lines.push(
    "Be concise (≤5 sentences), pro-audio literate, and reference exact UI controls when explaining (e.g. \"the Solo button\", \"the EQ low knob\"). " +
      (ctx.guestMode
        ? "User is a guest — nudge them to save before publishing."
        : "User is signed in."),
  );
  return lines.join(" ");
}
