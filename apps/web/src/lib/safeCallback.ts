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
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}callbackUrl=${encodeURIComponent(callbackPath)}`;
}
