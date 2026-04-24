import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

function getPostHog(): PostHog | null {
  if (!process.env.POSTHOG_API_KEY) return null;
  if (!_client) {
    _client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 20,
      flushInterval: 10_000,
    });
  }
  return _client;
}

export interface TrackEvent {
  event: string;
  userId?: string;
  properties?: Record<string, unknown>;
}

export function track({ event, userId, properties }: TrackEvent) {
  const ph = getPostHog();
  if (!ph) return;
  if (userId) {
    ph.capture({ distinctId: userId, event, properties });
  } else {
    ph.capture({ distinctId: "anonymous", event, properties });
  }
}

export async function flushAnalytics() {
  await getPostHog()?.shutdown();
}
