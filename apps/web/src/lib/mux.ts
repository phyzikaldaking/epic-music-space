import Mux from "@mux/mux-node";

const tokenId = process.env.MUX_TOKEN_ID;
const tokenSecret = process.env.MUX_TOKEN_SECRET;

let client: Mux | null = null;

export function getMuxClient(): Mux | null {
  if (!tokenId || !tokenSecret) return null;
  if (!client) {
    client = new Mux({ tokenId, tokenSecret });
  }
  return client;
}

export const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SIGNING_SECRET;
