import { NextResponse } from "next/server";

export function getRequestId(req: Request): string {
  const forwarded =
    req.headers.get("x-request-id") ??
    req.headers.get("x-correlation-id");
  if (forwarded && forwarded.trim().length > 0) {
    return forwarded.trim().slice(0, 128);
  }
  return crypto.randomUUID();
}

export function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function jsonWithRequestId(
  requestId: string,
  body: unknown,
  init?: ResponseInit,
) {
  return withRequestId(NextResponse.json(body, init), requestId);
}
