import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  // Warn at startup — AI features degrade gracefully when key is absent
  console.warn("[ai] OPENAI_API_KEY is not set — AI features will be disabled");
}

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─────────────────────────────────────────────────────────
// SONG SENTIMENT ANALYSIS
// ─────────────────────────────────────────────────────────

export interface SongAnalysis {
  sentiment: number;     // 0–1
  moodTags: string[];
  summary: string;
  investabilityNote: string;
}

/**
 * Analyse a song description and metadata to produce a sentiment score
 * and mood tags. Returns a neutral fallback if OpenAI is unavailable.
 */
export async function analyseSong(
  title: string,
  artist: string,
  genre: string | null,
  description: string | null
): Promise<SongAnalysis> {
  if (!openai) {
    return {
      sentiment: 0.5,
      moodTags: [],
      summary: "AI analysis unavailable.",
      investabilityNote: "",
    };
  }

  const prompt = `You are a music industry analyst for a digital licensing platform.
Analyze the following song metadata and respond with valid JSON only.

Song: "${title}"
Artist: "${artist}"
Genre: "${genre ?? "Unknown"}"
Description: "${description ?? "No description provided."}"

Respond with this exact JSON shape:
{
  "sentiment": <number 0-1, where 1 = highly positive/commercial potential>,
  "moodTags": <array of up to 5 mood/genre tags, lowercase, e.g. ["upbeat","melodic"]>,
  "summary": <one sentence summary of the song's licensing appeal>,
  "investabilityNote": <one sentence about why license holders might be interested>
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty OpenAI response");

    const parsed = JSON.parse(raw) as Partial<SongAnalysis>;
    return {
      sentiment: typeof parsed.sentiment === "number"
        ? Math.min(1, Math.max(0, parsed.sentiment))
        : 0.5,
      moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags.slice(0, 5) : [],
      summary: parsed.summary ?? "",
      investabilityNote: parsed.investabilityNote ?? "",
    };
  } catch (err) {
    console.error("[ai.analyseSong]", err);
    return { sentiment: 0.5, moodTags: [], summary: "", investabilityNote: "" };
  }
}

// ─────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────

export interface RecommendedSong {
  songId: string;
  reason: string;
}

/**
 * Given a user's license history (song titles), suggest which songs from
 * the available catalog they might want to license next.
 */
export async function recommendSongs(
  ownedTitles: string[],
  candidateSongs: Array<{ id: string; title: string; artist: string; genre: string | null }>
): Promise<RecommendedSong[]> {
  if (!openai || candidateSongs.length === 0) return [];

  const catalog = candidateSongs
    .slice(0, 30) // limit context
    .map((s) => `[${s.id}] "${s.title}" by ${s.artist} (${s.genre ?? "Unknown"})`)
    .join("\n");

  const owned = ownedTitles.length
    ? ownedTitles.slice(0, 10).join(", ")
    : "none yet";

  const prompt = `You are a music licensing recommendation engine.
A user already holds licenses for: ${owned}

Available catalog:
${catalog}

Recommend up to 3 songs from the catalog that would complement the user's taste.
Respond with valid JSON only, in this shape:
[
  { "songId": "<id from catalog>", "reason": "<one sentence reason>" }
]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 400,
      temperature: 0.5,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return [];

    // response_format json_object wraps in an object; extract array
    const parsed = JSON.parse(raw) as unknown;
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>).recommendations ?? [];

    return (arr as Array<{ songId: string; reason: string }>)
      .filter((r) => r.songId && r.reason)
      .slice(0, 3);
  } catch (err) {
    console.error("[ai.recommendSongs]", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────
// AI ASSISTANT CHAT
// ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the Epic Music Space AI assistant. You help users:
- Discover songs to license
- Understand the digital music licensing model (NOT securities/investments — these are contractual revenue participation licenses)
- Navigate the platform (marketplace, versus battles, studio pages, label system)
- Understand how AI scores work (popularity metric only, not financial advice)

Keep answers concise, friendly, and music-focused. Never give financial or legal advice.`;

export async function chatWithAssistant(
  messages: ChatMessage[]
): Promise<string> {
  if (!openai) return "AI assistant is not available right now.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.slice(-10), // keep last 10 turns for context
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return (
      completion.choices[0]?.message?.content ??
      "I couldn't generate a response. Please try again."
    );
  } catch (err) {
    console.error("[ai.chat]", err);
    return "AI assistant encountered an error. Please try again.";
  }
}
