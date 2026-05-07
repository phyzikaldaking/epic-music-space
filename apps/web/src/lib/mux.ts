import type Mux from "@mux/mux-node";

let client: Mux | null = null;
let lastConfigKey: string | null = null;

export function getMuxClient(): Mux | null {
  // Read env at call-time (not module init) so runtime env changes (or
  // build-time inlining quirks) can't lock us into an "unconfigured" state.
  const tokenId = (process.env.MUX_TOKEN_ID ?? "").trim().replace(/^['"]|['"]$/g, "");
  const tokenSecret = (process.env.MUX_TOKEN_SECRET ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!tokenId || !tokenSecret) return null;

  const configKey = `${tokenId}:${tokenSecret}`;
  if (!client || lastConfigKey !== configKey) {
    lastConfigKey = configKey;
    // Defer the SDK require so routes that never use Mux skip the load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const MuxCtor = (require("@mux/mux-node") as typeof import("@mux/mux-node")).default;
    client = new MuxCtor({ tokenId, tokenSecret });
  }

  return client;
}

export function getMuxWebhookSecret(): string | null {
  const secret = (process.env.MUX_WEBHOOK_SIGNING_SECRET ?? "").trim().replace(/^['"]|['"]$/g, "");
  return secret ? secret : null;
}
