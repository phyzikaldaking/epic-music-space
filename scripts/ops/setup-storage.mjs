#!/usr/bin/env node
/**
 * Creates the required Supabase storage buckets for Epic Music Space.
 * Run once per environment (local + production).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/ops/setup-storage.mjs
 *
 * Or from the repo root with .env.local loaded:
 *   node -r dotenv/config scripts/ops/setup-storage.mjs \
 *     dotenv_config_path=apps/web/.env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Manually parse .env.local if vars not already set
function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file not found — ignore
  }
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  loadEnvFile(resolve(__dirname, "../../apps/web/.env.local"));
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.startsWith("your_")) {
  console.error(
    "❌ Missing env vars.\n" +
    "   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n" +
    "   (find the service role key in Supabase → Project Settings → API)\n"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const BUCKETS = [
  {
    name: "audio",
    public: true,
    fileSizeLimit: 500 * 1024 * 1024, // 500 MB
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/flac",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ],
  },
  {
    name: "covers",
    public: true,
    fileSizeLimit: 5 * 1024 * 1024, // 5 MB
    allowedMimeTypes: [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ],
  },
];

async function ensureBucket({ name, public: isPublic, fileSizeLimit, allowedMimeTypes }) {
  // Check if bucket already exists
  const { data: existing, error: listErr } = await supabase.storage.getBucket(name);

  if (listErr && !listErr.message.includes("not found")) {
    throw new Error(`Error checking bucket "${name}": ${listErr.message}`);
  }

  if (existing) {
    console.log(`✅ Bucket "${name}" already exists — skipping.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit,
    allowedMimeTypes,
  });

  if (error) {
    throw new Error(`Failed to create bucket "${name}": ${error.message}`);
  }

  console.log(`🪣  Created bucket "${name}" (public=${isPublic}, limit=${fileSizeLimit / 1024 / 1024}MB)`);
}

console.log(`\n🔧 Setting up Supabase storage on ${supabaseUrl}\n`);

for (const bucket of BUCKETS) {
  await ensureBucket(bucket);
}

console.log("\n✨ Storage setup complete.\n");
