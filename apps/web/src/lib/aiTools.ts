import { z } from "zod";
import type { EqBand } from "@/components/daw/dawEngine";

/** Tool schemas published to the AI Coach. The model receives these in
 *  the OpenAI tool-call protocol; on the client side, we use them to
 *  validate any incoming tool call before routing it to the engine. */

export const aiToolSchemas = {
  setBpm: z.object({
    bpm: z.number().int().min(40).max(240),
  }),
  setTrackEq: z.object({
    trackName: z.string().min(1).max(80),
    band: z.enum(["low", "mid", "high"]),
    db: z.number().min(-12).max(12),
  }),
  applyMasteringPreset: z.object({
    preset: z.enum([
      "streamReady",
      "loudClub",
      "podcast",
      "balancedAcoustic",
      "flat",
    ]),
  }),
  loadDemo: z.object({
    kind: z.enum(["curated", "random"]),
  }),
  setBeatKit: z.object({
    kit: z.enum([
      "trap",
      "drill",
      "afro",
      "hyperpop",
      "boomBap",
      "lofi",
      "acoustic",
    ]),
  }),
  armTrack: z.object({
    trackName: z.string().min(1).max(80),
    armed: z.boolean().default(true),
  }),
  setMasterEq: z.object({
    band: z.enum(["low", "mid", "high"]),
    db: z.number().min(-12).max(12),
  }),
  setLimiter: z.object({
    on: z.boolean(),
  }),
} as const;

export type AiToolName = keyof typeof aiToolSchemas;

/** OpenAI tool-call descriptors, ready to pass into
 *  chat.completions.create({ tools }). Kept in sync with aiToolSchemas
 *  so the model's tool list matches the validator. */
export interface OpenAiToolDescriptor {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const openAiTools: OpenAiToolDescriptor[] = [
  {
    type: "function",
    function: {
      name: "setBpm",
      description: "Set the project tempo in beats per minute.",
      parameters: {
        type: "object",
        properties: {
          bpm: { type: "integer", minimum: 40, maximum: 240 },
        },
        required: ["bpm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setTrackEq",
      description:
        "Adjust a track's three-band EQ. Use to fix muddy mids, boost air, or cut bass.",
      parameters: {
        type: "object",
        properties: {
          trackName: { type: "string", description: "Exact track name." },
          band: { type: "string", enum: ["low", "mid", "high"] },
          db: { type: "number", minimum: -12, maximum: 12 },
        },
        required: ["trackName", "band", "db"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "applyMasteringPreset",
      description:
        "Apply a one-click mastering chain. streamReady=-14 LUFS for Spotify/Apple. loudClub=hot for clubs. podcast=-16 LUFS speech. balancedAcoustic=gentle for live recordings. flat=no processing.",
      parameters: {
        type: "object",
        properties: {
          preset: {
            type: "string",
            enum: [
              "streamReady",
              "loudClub",
              "podcast",
              "balancedAcoustic",
              "flat",
            ],
          },
        },
        required: ["preset"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "loadDemo",
      description:
        "Load a starter session. 'curated' is a hand-tuned trap groove; 'random' is the surprise-me generator.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["curated", "random"] },
        },
        required: ["kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setBeatKit",
      description: "Switch the beat-machine drum kit.",
      parameters: {
        type: "object",
        properties: {
          kit: {
            type: "string",
            enum: [
              "trap",
              "drill",
              "afro",
              "hyperpop",
              "boomBap",
              "lofi",
              "acoustic",
            ],
          },
        },
        required: ["kit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "armTrack",
      description: "Arm a track for recording (or disarm with armed=false).",
      parameters: {
        type: "object",
        properties: {
          trackName: { type: "string" },
          armed: { type: "boolean" },
        },
        required: ["trackName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setMasterEq",
      description:
        "Adjust master EQ band by N dB. Use to fix tonal balance on the master bus.",
      parameters: {
        type: "object",
        properties: {
          band: { type: "string", enum: ["low", "mid", "high"] },
          db: { type: "number", minimum: -12, maximum: 12 },
        },
        required: ["band", "db"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "setLimiter",
      description: "Toggle the master limiter on or off.",
      parameters: {
        type: "object",
        properties: {
          on: { type: "boolean" },
        },
        required: ["on"],
      },
    },
  },
];

/** Strip C0/C1 controls, zero-width and bidi-override characters,
 *  and clamp length on any user-string argument that flows into
 *  the confirm-card description. React already escapes interpolated
 *  JSX text, but stripping these visual-trick code points (RLO
 *  U+202E, zero-width joiners, BOM) makes the displayed string match
 *  what the user thinks they're approving (#10). */
function safeArgText(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  const cleaned = value.replace(
    // C0 (00–20), DEL+C1 (7F–9F), zero-width (200B–200F),
    // bidi embeds (202A–202E), bidi isolates (2066–2069), BOM (FEFF).
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    "",
  );
  return cleaned.slice(0, 80);
}

/** Human-readable summary used in the confirm card before applying. */
export function describeToolCall(name: AiToolName, args: unknown): string {
  switch (name) {
    case "setBpm":
      return `Set BPM to ${(args as { bpm: number }).bpm}`;
    case "setTrackEq": {
      const a = args as { trackName: string; band: EqBand; db: number };
      const sign = a.db >= 0 ? "+" : "";
      return `${a.band} EQ on "${safeArgText(a.trackName)}" → ${sign}${a.db.toFixed(1)} dB`;
    }
    case "applyMasteringPreset": {
      const labels: Record<string, string> = {
        streamReady: "stream-ready",
        loudClub: "loud club",
        podcast: "podcast",
        balancedAcoustic: "balanced acoustic",
        flat: "flat (off)",
      };
      const preset = (args as { preset: string }).preset;
      return `Apply ${labels[preset] ?? safeArgText(preset)} mastering preset`;
    }
    case "loadDemo":
      return `Load ${safeArgText((args as { kind: string }).kind)} demo session`;
    case "setBeatKit":
      return `Switch drum kit to ${safeArgText((args as { kit: string }).kit)}`;
    case "armTrack": {
      const a = args as { trackName: string; armed?: boolean };
      const safeName = safeArgText(a.trackName);
      return a.armed === false
        ? `Disarm "${safeName}"`
        : `Arm "${safeName}" for recording`;
    }
    case "setMasterEq": {
      const a = args as { band: EqBand; db: number };
      const sign = a.db >= 0 ? "+" : "";
      return `Master ${a.band} EQ → ${sign}${a.db.toFixed(1)} dB`;
    }
    case "setLimiter":
      return (args as { on: boolean }).on
        ? "Turn the master limiter on"
        : "Turn the master limiter off";
  }
}
