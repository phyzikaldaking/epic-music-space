import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { streamChatWithAssistant } from "@/lib/ai";
import { strictLimiter } from "@/lib/rateLimit";
import { readJsonBodyLimited } from "@/lib/apiHardening";
import { getRequestId, jsonWithRequestId, withRequestId } from "@/lib/requestTracing";
import { chatSchema, buildStudioPromptSuffix } from "@/lib/aiChatSchemas";
import { openAiTools } from "@/lib/aiTools";

export const runtime = "nodejs";

function sseEvent(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function sseDone(): Uint8Array {
  return new TextEncoder().encode(`data: [DONE]\n\n`);
}

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
      { status: 429, headers: { "Retry-After": "60" } },
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
    return jsonWithRequestId(
      requestId,
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const studioPromptExtras = parsed.data.studioContext
    ? buildStudioPromptSuffix(parsed.data.studioContext)
    : undefined;

  const inStudio = Boolean(parsed.data.studioContext);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamChatWithAssistant(parsed.data.messages, {
          systemPromptExtras: studioPromptExtras,
          // Tool calls are only available inside the studio — keeps the
          // marketing chatbot from hallucinating actions on /pricing etc.
          tools: inStudio ? openAiTools : undefined,
        })) {
          if (event.kind === "delta") {
            controller.enqueue(sseEvent({ delta: event.text }));
          } else {
            controller.enqueue(
              sseEvent({
                tool: { id: event.id, name: event.name, args: event.args },
              }),
            );
          }
        }
      } catch (err) {
        console.error("[ai-chat-stream] iteration error", { requestId, err });
        controller.enqueue(
          sseEvent({ error: "Stream interrupted. Try again." }),
        );
      } finally {
        controller.enqueue(sseDone());
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
