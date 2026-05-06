const DEFAULT_CALLBACK_PATH = "/dashboard";

export function sanitizeCallbackPath(
  value: string | null | undefined,
  fallback = DEFAULT_CALLBACK_PATH,
) {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "https://epicmusicspace.local");
    if (parsed.origin !== "https://epicmusicspace.local") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function appendCallbackParam(url: string, callbackPath: string) {
  // Defense-in-depth: re-run sanitizeCallbackPath inside this helper so a
  // future caller who forgets to sanitize their input can't accidentally
  // create an open-redirect. Trusted callers paying the (cheap) double-
  // sanitize cost is fine; the result is idempotent.
  const safePath = sanitizeCallbackPath(callbackPath);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}callbackUrl=${encodeURIComponent(safePath)}`;
}
