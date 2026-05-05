import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

let warnedMissingKey = false;

function isVercelProdLike() {
  const env = process.env.VERCEL_ENV?.trim();
  return env === "production" || env === "preview";
}

function getEncryptionKeyMaterial() {
  return process.env.SOCIAL_ENCRYPTION_KEY?.trim() ?? "";
}

export function isSocialEncryptionConfigured(): boolean {
  return Boolean(getEncryptionKeyMaterial());
}

export function encryptToken(plaintext: string) {
  const keyMaterial = getEncryptionKeyMaterial();
  if (!keyMaterial) {
    // Never silently store plaintext tokens on Vercel deployments.
    // (Local dev/test may omit the key to keep setup lightweight.)
    if (isVercelProdLike()) {
      throw new Error("SOCIAL_ENCRYPTION_KEY is required to store connected account tokens securely.");
    }
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("SOCIAL_ENCRYPTION_KEY is not set — connected account tokens will be stored plaintext in DB (dev-only).");
    }
    return plaintext;
  }

  const key = crypto.createHash("sha256").update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(payload: string) {
  const keyMaterial = getEncryptionKeyMaterial();
  if (!keyMaterial) return payload;
  try {
    const key = crypto.createHash("sha256").update(keyMaterial).digest();
    const data = Buffer.from(payload, "base64");
    const iv = data.slice(0, 12);
    const tag = data.slice(12, 28);
    const encrypted = data.slice(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    console.error("decryptToken failed", err);
    return payload;
  }
}
