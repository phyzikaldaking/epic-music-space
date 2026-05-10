import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { chatWithAssistant } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";
import { chatSchema, buildStudioPromptSuffix } from "@/lib/aiChatSchemas";

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithRequestId(requestId, { error: "Unauthorized" }, { status: 401 });
  }

  try {
    await strictLimiter.consume(`ai:chat:${session.user.id}`);
  } catch {
    return jsonWithRequestId(
      requestId,
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const bodyResult = await readJsonBodyLimited<unknown>(req, {
    maxBytes: 128 * 1024,
    invalidMessage: "Expected JSON body",
  });
  if (!bodyResult.ok) {
    return withRequestId(bodyResult.response, requestId);
  }

  const parsed = chatSchema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(requestId, { error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const studioPromptExtras = parsed.data.studioContext
    ? buildStudioPromptSuffix(parsed.data.studioContext)
    : undefined;

  const chatResult = await withRouteTimeout("ai-chat", 12_000, async () =>
    chatWithAssistant(parsed.data.messages, {
      systemPromptExtras: studioPromptExtras,
    })
  );
  if (!chatResult.ok) {
    console.warn("[ai-chat] timeout or backend failure", { requestId, userId: session.user.id });
    return withRequestId(chatResult.response, requestId);
  }

  const reply = chatResult.value;
  return jsonWithRequestId(requestId, { reply });
}
