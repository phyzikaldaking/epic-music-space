/**
 * Push notification sender utility.
 *
 * Sends APNs (iOS) and FCM (Android) pushes to one or more users via
 * their registered device tokens. Tokens are fetched from the database.
 *
 * Required environment variables:
 *   FCM_SERVER_KEY        — Firebase Cloud Messaging server key (Android)
 *   APNS_KEY_ID           — APNs auth key ID (iOS)
 *   APNS_TEAM_ID          — Apple Developer Team ID (iOS)
 *   APNS_KEY_P8           — APNs private key in PEM/p8 format (iOS)
 *   APNS_BUNDLE_ID        — App bundle identifier, e.g. "com.epicmusicspace.app"
 *
 * All fields are optional at startup — missing credentials cause the
 * corresponding platform to be skipped (not to throw), so the app works
 * in development without native creds configured.
 */

import { prisma } from "@/lib/prisma";

export interface PushPayload {
  title: string;
  body: string;
  /** Optional deep-link URL opened when the user taps the notification. */
  url?: string;
  /** Arbitrary extra data forwarded to the app. */
  data?: Record<string, string>;
}

/**
 * Send a push notification to every registered device of the given users.
 *
 * @param userIds  Array of User.id strings.
 * @param payload  Notification content and optional deep-link.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!userIds.length) return;

  const tokens = await prisma.pushToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true, platform: true },
  });

  if (!tokens.length) return;

  const iosTokens = tokens
    .filter((t) => t.platform === "ios")
    .map((t) => t.token);
  const androidTokens = tokens
    .filter((t) => t.platform === "android")
    .map((t) => t.token);

  const data: Record<string, string> = {
    ...payload.data,
    ...(payload.url ? { url: payload.url } : {}),
  };

  await Promise.allSettled([
    iosTokens.length ? sendApns(iosTokens, payload, data) : Promise.resolve(),
    androidTokens.length
      ? sendFcm(androidTokens, payload, data)
      : Promise.resolve(),
  ]);
}

// ── APNs (iOS) ───────────────────────────────────────────────────────────────

async function sendApns(
  tokens: string[],
  payload: PushPayload,
  data: Record<string, string>
): Promise<void> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyP8 = process.env.APNS_KEY_P8;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyId || !teamId || !keyP8 || !bundleId) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[EMS push] APNs not configured — skipping iOS tokens.");
    }
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const host = isProd
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";

  // Build JWT for APNs (ES256, valid for 1 hour).
  const jwtToken = await buildApnsJwt(keyId, teamId, keyP8);

  const apnsPayload = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    ...data,
  };

  await Promise.allSettled(
    tokens.map((token) =>
      fetch(`https://${host}/3/device/${token}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwtToken}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "content-type": "application/json",
        },
        body: JSON.stringify(apnsPayload),
      })
    )
  );
}

async function buildApnsJwt(
  keyId: string,
  teamId: string,
  keyP8: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const claims = { iss: teamId, iat: now };

  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const signingInput = `${enc(header)}.${enc(claims)}`;

  const keyData = keyP8
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    Buffer.from(keyData, "base64"),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    Buffer.from(signingInput)
  );

  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

// ── FCM (Android) ────────────────────────────────────────────────────────────

async function sendFcm(
  tokens: string[],
  payload: PushPayload,
  data: Record<string, string>
): Promise<void> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[EMS push] FCM not configured — skipping Android tokens.");
    }
    return;
  }

  // FCM v1 multicast (legacy HTTP API, max 500 tokens per request).
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    chunks.push(tokens.slice(i, i + 500));
  }

  await Promise.allSettled(
    chunks.map((chunk) =>
      fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registration_ids: chunk,
          notification: { title: payload.title, body: payload.body },
          data,
        }),
      })
    )
  );
}
