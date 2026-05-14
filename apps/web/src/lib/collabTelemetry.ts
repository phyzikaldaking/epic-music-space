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

type CollabTelemetryEvent = Record<string, unknown> & {
  ts: string;
  service: "ems-collab";
  level: CollabTelemetryLevel;
};

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (/token|secret|key|invite|jwt/i.test(value)) return "[redacted]";
    return value.length > 180 ? `${value.slice(0, 180)}...` : value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") return scrubObject(value as Record<string, unknown>);
  return value;
}

function scrubObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [
      key,
      /token|secret|key|invite|jwt/i.test(key) ? "[redacted]" : scrubValue(val),
    ]),
  );
}

export function trackCollabEvent(payload: CollabTelemetryPayload) {
  const scrubbedPayload = scrubObject(payload as Record<string, unknown>);
  const event: CollabTelemetryEvent = {
    ...scrubbedPayload,
    ts: new Date().toISOString(),
    service: "ems-collab",
    level: payload.level ?? "info",
  };

  const logger = event.level === "error" ? console.error : event.level === "warn" ? console.warn : console.info;
  logger("[ems-collab]", JSON.stringify(event));
}

export function telemetryFromError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}
