const allowedKeys = new Set(["mode", "template", "category", "destination", "result"]);

export function buildStudioAnalyticsEvent(action: "mode" | "template" | "preflight" | "recovery" | "finish" | "destination", properties: Record<string, unknown>) {
  const safe = Object.fromEntries(Object.entries(properties).filter(([key, value]) => allowedKeys.has(key) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")));
  return { event:`studio_${action}`, ...safe };
}
