import type { FunnelEventName } from "@/lib/funnelEvents";

interface FunnelPayload {
  event: FunnelEventName;
  role?: string;
  source?: string;
  properties?: Record<string, unknown>;
}

export function postFunnelEvent(payload: FunnelPayload) {
  return fetch("/api/analytics/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => null);
}
