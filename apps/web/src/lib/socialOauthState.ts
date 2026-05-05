import crypto from "node:crypto";

const STATE_TTL_SECONDS = 10 * 60;
const STATE_COOKIE = "ems_social_oauth_state";

type SocialProvider = "twitter" | "instagram";

interface SocialOAuthStatePayload {
  userId: string;
  provider: SocialProvider;
  nonce: string;
  exp: number;
}

function getStateSecret() {
  return (
    process.env.SOCIAL_OAUTH_STATE_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "dev-social-state-secret"
  );
}

function b64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64: string) {
  return crypto
    .createHmac("sha256", getStateSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function getSocialStateCookieName() {
  return STATE_COOKIE;
}

export function buildSocialOAuthState(
  userId: string,
  provider: SocialProvider,
) {
  const payload: SocialOAuthStatePayload = {
    userId,
    provider,
    nonce: crypto.randomBytes(12).toString("hex"),
    exp: Date.now() + STATE_TTL_SECONDS * 1000,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const signature = sign(payloadB64);
  const state = `${payloadB64}.${signature}`;
  return { state, maxAgeSeconds: STATE_TTL_SECONDS };
}

export function verifySocialOAuthState(
  state: string | null | undefined,
  expectedProvider: SocialProvider,
) {
  if (!state) return null;
  const [payloadB64, providedSig] = state.split(".");
  if (!payloadB64 || !providedSig) return null;
  const expectedSig = sign(payloadB64);
  if (providedSig !== expectedSig) return null;

  try {
    const payload = JSON.parse(fromB64url(payloadB64)) as SocialOAuthStatePayload;
    if (!payload?.userId || !payload?.provider || !payload?.exp) return null;
    if (payload.provider !== expectedProvider) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
