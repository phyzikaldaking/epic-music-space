type CollabTelemetryLevel = "info" | "warn" | "error";

type CollabTelemetryPayload = {
  event: string;
  level?: CollabTelemetryLevel;
  roomId?: string;
  scope?: string;
  action?: string;
  seatId?: string;
  permission?: string;
  role?: string;
  reason?: string;
  status?: number;
  metadata?: Record<string, unknown>;
};

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 180) return `${value.slice(0, 180)}...`;
    if (/token|secret|key|invite|jwt/i.test(value)) return "[redacted]";
    return value;
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        /token|secret|key|invite|jwt/i.test(key) ? "[redacted]" : scrub(val),
      ]),
    );
  }
  return value;
}

export function trackCollabEvent(payload: CollabTelemetryPayload) {
  const event = {
    ts: new Date().toISOString(),
    service: "ems-collab",
    level: payload.level ?? "info",
    ...scrub(payload),
  };

  const logger = event.level === "error" ? console.error : event.level === "warn" ? console.warn : console.info;
  logger("[ems-collab]", JSON.stringify(event));
}

export function telemetryFromError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}
