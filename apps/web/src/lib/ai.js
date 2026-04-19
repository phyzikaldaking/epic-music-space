import OpenAI from "openai";
if (!process.env.OPENAI_API_KEY) {
    // Warn at startup — AI features degrade gracefully when key is absent
    console.warn("[ai] OPENAI_API_KEY is not set — AI features will be disabled");
}
export const openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
/**
 * Analyse a song description and metadata to produce a sentiment score
 * and mood tags. Returns a neutral fallback if OpenAI is unavailable.
 */
export async function analyseSong(title, artist, genre, description) {
    var _a, _b, _c, _d;
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
Genre: "${genre !== null && genre !== void 0 ? genre : "Unknown"}"
Description: "${description !== null && description !== void 0 ? description : "No description provided."}"

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
        const raw = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!raw)
            throw new Error("Empty OpenAI response");
        const parsed = JSON.parse(raw);
        return {
            sentiment: typeof parsed.sentiment === "number"
                ? Math.min(1, Math.max(0, parsed.sentiment))
                : 0.5,
            moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags.slice(0, 5) : [],
            summary: (_c = parsed.summary) !== null && _c !== void 0 ? _c : "",
            investabilityNote: (_d = parsed.investabilityNote) !== null && _d !== void 0 ? _d : "",
        };
    }
    catch (err) {
        console.error("[ai.analyseSong]", err);
        return { sentiment: 0.5, moodTags: [], summary: "", investabilityNote: "" };
    }
}
/**
 * Given a user's license history (song titles), suggest which songs from
 * the available catalog they might want to license next.
 */
export async function recommendSongs(ownedTitles, candidateSongs) {
    var _a, _b, _c;
    if (!openai || candidateSongs.length === 0)
        return [];
    const catalog = candidateSongs
        .slice(0, 30) // limit context
        .map((s) => { var _a; return `[${s.id}] "${s.title}" by ${s.artist} (${(_a = s.genre) !== null && _a !== void 0 ? _a : "Unknown"})`; })
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
        const raw = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!raw)
            return [];
        // response_format json_object wraps in an object; extract array
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed)
            ? parsed
            : (_c = parsed.recommendations) !== null && _c !== void 0 ? _c : [];
        return arr
            .filter((r) => r.songId && r.reason)
            .slice(0, 3);
    }
    catch (err) {
        console.error("[ai.recommendSongs]", err);
        return [];
    }
}
const SYSTEM_PROMPT = `You are the Epic Music Space AI assistant. You help users:
- Discover songs to license
- Understand the digital music licensing model (NOT securities/investments — these are contractual revenue participation licenses)
- Navigate the platform (marketplace, versus battles, studio pages, label system)
- Understand how AI scores work (popularity metric only, not financial advice)

Keep answers concise, friendly, and music-focused. Never give financial or legal advice.`;
export async function chatWithAssistant(messages) {
    var _a, _b, _c;
    if (!openai)
        return "AI assistant is not available right now.";
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
        return ((_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : "I couldn't generate a response. Please try again.");
    }
    catch (err) {
        console.error("[ai.chat]", err);
        return "AI assistant encountered an error. Please try again.";
    }
}
