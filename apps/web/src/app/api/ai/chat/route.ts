import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { chatWithAssistant } from "@/lib/ai";
import { z } from "zod";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited, withRouteTimeout } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

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

  const parsed = schema.safeParse(bodyResult.value);
  if (!parsed.success) {
    return jsonWithRequestId(requestId, { error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const chatResult = await withRouteTimeout("ai-chat", 12_000, async () =>
    chatWithAssistant(parsed.data.messages)
  );
  if (!chatResult.ok) {
    console.warn("[ai-chat] timeout or backend failure", { requestId, userId: session.user.id });
    return withRequestId(chatResult.response, requestId);
  }

  const reply = chatResult.value;
  return jsonWithRequestId(requestId, { reply });
}
