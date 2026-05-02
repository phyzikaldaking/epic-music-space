import path from "node:path";
import process from "node:process";
import { repoRoot, unique } from "./lib.mjs";

export const dopplerConfigs = ["dev", "preview", "prod"];

export const controlPlaneKeys = [
  "GITHUB_REPOSITORY",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
];

export const serviceRequirements = {
  GitHub: ["GITHUB_REPOSITORY"],
  Vercel: ["VERCEL_ORG_ID", "VERCEL_PROJECT_ID"],
  Supabase: [
    "DATABASE_URL",
    "DIRECT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ],
  Stripe: [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID_STARTER",
    "STRIPE_PRICE_ID_PRO",
    "STRIPE_PRICE_ID_PRIME",
    "STRIPE_PRICE_ID_TEAM",
    "STRIPE_PRICE_ID_LABEL",
  ],
  OpenAI: ["OPENAI_API_KEY"],
  "Upstash Redis": ["REDIS_URL"],
  Resend: ["RESEND_API_KEY"],
  PostHog: ["POSTHOG_API_KEY"],
};

export const optionalRequirements = {
  GoogleOAuth: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  EmailBranding: ["EMAIL_FROM"],
  PostHogHost: ["POSTHOG_HOST"],
  DopplerProject: ["DOPPLER_PROJECT"],
  DopplerConfigs: [
    "DOPPLER_CONFIG_DEV",
    "DOPPLER_CONFIG_PREVIEW",
    "DOPPLER_CONFIG_PROD",
  ],
  StripeWebhookForward: ["STRIPE_WEBHOOK_FORWARD_URL"],
  VercelApi: ["VERCEL_TOKEN"],
};

export const sharedAppKeys = unique([
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "SITE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_ID_STARTER",
  "STRIPE_PRICE_ID_PRO",
  "STRIPE_PRICE_ID_PRIME",
  "STRIPE_PRICE_ID_TEAM",
  "STRIPE_PRICE_ID_LABEL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "REDIS_URL",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "CRON_SECRET",
]);

export const rootEnvKeys = unique([...controlPlaneKeys, ...sharedAppKeys]);

export const webEnvKeys = unique([...sharedAppKeys]);

export const apiEnvKeys = unique([
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REDIS_URL",
  "NEXT_PUBLIC_APP_URL",
  "PORT",
]);

export const vercelEnvKeys = unique([
  ...webEnvKeys,
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "SITE_URL",
]);

export const githubSecretKeys = unique([
  ...Object.values(serviceRequirements).flat(),
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "SITE_URL",
  "CRON_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SUPABASE_PROJECT_REF",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "DOPPLER_PROJECT",
  "DOPPLER_CONFIG_DEV",
  "DOPPLER_CONFIG_PREVIEW",
  "DOPPLER_CONFIG_PROD",
  "STRIPE_WEBHOOK_FORWARD_URL",
]);

export const localEnvTargets = [
  {
    title: "npm run env:pull",
    filePath: path.join(repoRoot, ".env.local"),
    keys: rootEnvKeys,
  },
  {
    title: "npm run env:pull",
    filePath: path.join(repoRoot, "apps/web/.env.local"),
    keys: webEnvKeys,
  },
  {
    title: "npm run env:pull",
    filePath: path.join(repoRoot, "apps/api/.env"),
    keys: apiEnvKeys,
  },
];

export function getDopplerConfigName(environment) {
  const envKey = `DOPPLER_CONFIG_${environment.toUpperCase()}`;
  return process.env[envKey] ?? environment;
}
