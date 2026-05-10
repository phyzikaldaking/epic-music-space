import { NextResponse } from "next/server";
import { withTimeout } from "@/lib/resilience";

export type JsonBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: NextResponse };

export async function readJsonBodyLimited<T>(
  req: Request,
  options: { maxBytes: number; invalidMessage?: string } = { maxBytes: 64 * 1024 },
): Promise<JsonBodyResult<T>> {
  const maxBytes = options.maxBytes;
  const invalidMessage = options.invalidMessage ?? "Invalid JSON";

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Payload too large (max ${maxBytes} bytes)` },
        { status: 413 },
      ),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: invalidMessage }, { status: 400 }),
    };
  }

  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Payload too large (max ${maxBytes} bytes)` },
        { status: 413 },
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: invalidMessage }, { status: 400 }),
    };
  }
}

export async function withRouteTimeout<T>(
  label: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<
  | { ok: true; value: T }
  | { ok: false; response: NextResponse }
> {
  // Tie an AbortController to the timeout so upstream fetches receive a
  // real cancel signal when we give up. Callers that don't care can
  // ignore the parameter — back-compatible with `() => Promise<T>`.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await withTimeout(
      () => operation(controller.signal),
      timeoutMs,
      label,
    );
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("timed out")) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Service temporarily overloaded. Please retry." },
          { status: 503, headers: { "Retry-After": "5" } },
        ),
      };
    }

    return {
      ok: false,
      response: NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}
