import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY = process.env.SOCIAL_ENCRYPTION_KEY || "";

if (!KEY) {
  console.warn("SOCIAL_ENCRYPTION_KEY is not set — connected account tokens will be stored plaintext in DB (not recommended)");
}

export function encryptToken(plaintext: string) {
  if (!KEY) return plaintext;
  const key = crypto.createHash("sha256").update(KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptToken(payload: string) {
  if (!KEY) return payload;
  try {
    const key = crypto.createHash("sha256").update(KEY).digest();
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
