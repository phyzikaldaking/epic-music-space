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
    selectedTrackName: z.string().max(80).nullable().optional(),
    lastAction: z.string().max(240).nullable().optional(),
    guestMode: z.boolean().optional().default(false),
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
  session.push(`beat machine ${ctx.beatEnabled ? "ON" : "OFF"}`);
  if (session.length > 0) lines.push(`Session: ${session.join(", ")}.`);
  lines.push(
    `Tracks: ${ctx.trackCount} (${ctx.armedTracks} armed). Recorded audio: ${ctx.hasRecordedAudio ? "yes" : "no"}.`,
  );
  if (ctx.selectedTrackName) lines.push(`Selected: "${ctx.selectedTrackName}".`);
  if (ctx.lastAction) lines.push(`Last action: ${ctx.lastAction}.`);
  lines.push(
    "Be concise (≤5 sentences), pro-audio literate, and reference exact UI controls when explaining (e.g. \"the Solo button\", \"the EQ low knob\"). " +
      (ctx.guestMode
        ? "User is a guest — nudge them to save before publishing."
        : "User is signed in."),
  );
  return lines.join(" ");
}
