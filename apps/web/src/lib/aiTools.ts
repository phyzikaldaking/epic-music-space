import { z } from "zod";

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
];

/** Human-readable summary used in the confirm card before applying. */
export function describeToolCall(name: AiToolName, args: unknown): string {
  switch (name) {
    case "setBpm":
      return `Set BPM to ${(args as { bpm: number }).bpm}`;
    case "setTrackEq": {
      const a = args as { trackName: string; band: string; db: number };
      const sign = a.db >= 0 ? "+" : "";
      return `${a.band} EQ on "${a.trackName}" → ${sign}${a.db.toFixed(1)} dB`;
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
      return `Apply ${labels[preset] ?? preset} mastering preset`;
    }
    case "loadDemo":
      return `Load ${(args as { kind: string }).kind} demo session`;
    case "setBeatKit":
      return `Switch drum kit to ${(args as { kit: string }).kit}`;
    case "armTrack": {
      const a = args as { trackName: string; armed?: boolean };
      return a.armed === false
        ? `Disarm "${a.trackName}"`
        : `Arm "${a.trackName}" for recording`;
    }
  }
}
