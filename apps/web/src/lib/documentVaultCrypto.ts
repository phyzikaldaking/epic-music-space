import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
function key() {
  const raw = process.env.DOCUMENT_VAULT_ENCRYPTION_KEY;
  if (!raw) throw new Error("DOCUMENT_VAULT_ENCRYPTION_KEY is not configured");
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : createHash("sha256").update(raw).digest();
}
export function encryptVaultFile(input: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, key(), iv);
  const data = Buffer.concat([cipher.update(input), cipher.final()]);
  return { data: Buffer.concat([iv, cipher.getAuthTag(), data]), version: "aes-256-gcm:v1" };
}
export function decryptVaultFile(input: Buffer) {
  if (input.length < 28) throw new Error("Invalid vault payload");
  const decipher = createDecipheriv(algorithm, key(), input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  return Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]);
}
