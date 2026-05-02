import path from "node:path";
import { fail, loadEnvFile, repoRoot, runCommand } from "./lib.mjs";

const localValues = {
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/web/.env.local")),
};

const forwardUrl =
  localValues.STRIPE_WEBHOOK_FORWARD_URL ??
  "http://localhost:3000/api/webhooks/stripe";

const events = [
  "checkout.session.completed",
  "checkout.session.expired",
  "payment_intent.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "account.updated",
].join(",");

const result = runCommand("stripe", [
  "listen",
  "--forward-to",
  forwardUrl,
  "--events",
  events,
], { stdio: "inherit" });

if (!result.ok) {
  fail(result.stderr.trim() || result.stdout.trim() || "Stripe listen failed");
}
