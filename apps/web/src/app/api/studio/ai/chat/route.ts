import { NextResponse } from "next/server";
import { createAiStudioSystemPrompt } from "@/components/daw/aiStudioEngine";
import type { AiStudioRoleId } from "@/components/daw/aiStudioRoles";

export const runtime = "nodejs";

type ChatHistoryMessage = {
  role?: "user" | "assistant" | "system";
  content?: string;
};

type AiStudioChatRequest = {
  roleId?: AiStudioRoleId;
  message?: string;
  history?: ChatHistoryMessage[];
  sessionContext?: {
    songTitle?: string;
    artistName?: string;
    bpm?: number;
    key?: string;
    mode?: string;
    activeTrack?: string;
    isRecording?: boolean;
  };
};

function hasOpenAiKey(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.startsWith("sk-") && !key.includes("replace"));
}

function normalizeRoleId(roleId: AiStudioChatRequest["roleId"]): AiStudioRoleId {
  const allowed: AiStudioRoleId[] = ["engineer", "producer", "mix_doctor", "mastering", "publishing", "voice_command"];
  return roleId && allowed.includes(roleId) ? roleId : "engineer";
}

function buildContextBlock(input: AiStudioChatRequest): string {
  const context = input.sessionContext;
  if (!context) return "No live session context was provided.";
  return [
    "Live EMS session context:",
    context.songTitle ? `Song title: ${context.songTitle}` : null,
    context.artistName ? `Artist: ${context.artistName}` : null,
    typeof context.bpm === "number" ? `BPM: ${context.bpm}` : null,
    context.key ? `Key: ${context.key}` : null,
    context.mode ? `Studio mode: ${context.mode}` : null,
    context.activeTrack ? `Active track: ${context.activeTrack}` : null,
    typeof context.isRecording === "boolean" ? `Recording: ${context.isRecording ? "yes" : "no"}` : null,
  ].filter(Boolean).join("\n");
}

export async function POST(req: Request) {
  let body: AiStudioChatRequest;
  try {
    body = (await req.json()) as AiStudioChatRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const roleId = normalizeRoleId(body.roleId);
  const message = body.message?.trim();

  if (!message) {
    return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
  }

  if (!hasOpenAiKey()) {
    return NextResponse.json(
      {
        ok: false,
        unavailable: true,
        error: "AI Studio needs OPENAI_API_KEY in Vercel environment variables before live responses can run.",
        reply: "AI Studio is installed, but live AI responses are not available until OPENAI_API_KEY is configured in Vercel. The Studio can still use local guidance, presets, and workflow tools.",
      },
      { status: 503 },
    );
  }

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const systemPrompt = [
      createAiStudioSystemPrompt(roleId),
      buildContextBlock(body),
      "Keep responses concise, tactical, and focused on what the artist should do next inside the studio.",
    ].join("\n\n");

    const history = (body.history ?? [])
      .filter((item) => item.role === "user" || item.role === "assistant")
      .slice(-8)
      .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content ?? "").slice(0, 2000) }));

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_STUDIO_MODEL || "gpt-4o-mini",
      temperature: 0.55,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    return NextResponse.json({ ok: true, roleId, reply: reply || "I am ready. Tell me the next studio move." });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Unknown AI Studio error.";
    return NextResponse.json({ ok: false, error: messageText }, { status: 500 });
  }
}
