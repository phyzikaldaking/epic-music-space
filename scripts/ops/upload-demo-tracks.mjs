#!/usr/bin/env node
/**
 * Upload the legacy demo tracks (WAV + SVG covers) to Supabase Storage so we
 * can drop the ~3MB of binary files from the git repo.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/upload-demo-tracks.mjs
 *
 * Idempotent — uses upsert. Safe to run repeatedly.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? "audio";
const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET ?? "covers";
const PREFIX = process.env.SUPABASE_DEMO_PREFIX ?? "demo/legacy";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const audioDir = path.join(repoRoot, "apps/web/public/demo/audio");
const coversDir = path.join(repoRoot, "apps/web/public/demo/covers");

const CONTENT_TYPES = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function ensureBucket(name) {
  // Idempotent: createBucket returns 400 "already exists" if it does.
  try {
    await supabase.storage.createBucket(name, { public: true });
    console.log(`  created bucket ${name}`);
  } catch (err) {
    if (!String(err?.message ?? "").includes("already exists")) {
      console.warn(`  ${name}: ${err?.message ?? err}`);
    }
  }
}

async function uploadDir(localDir, bucket) {
  let files;
  try {
    files = await readdir(localDir);
  } catch {
    console.log(`  skip ${localDir} (missing)`);
    return;
  }

  console.log(`uploading ${files.length} file(s) from ${localDir} -> ${bucket}/${PREFIX}/`);
  await ensureBucket(bucket);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      console.log(`  skip ${file} (unknown ext)`);
      continue;
    }
    const buf = await readFile(path.join(localDir, file));
    const key = `${PREFIX}/${file}`;
    const { error } = await supabase.storage.from(bucket).upload(key, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.error(`  ✗ ${file}: ${error.message}`);
      continue;
    }
    const { data } = supabase.storage.from(bucket).getPublicUrl(key);
    console.log(`  ✓ ${file} -> ${data.publicUrl}`);
  }
}

await uploadDir(audioDir, AUDIO_BUCKET);
await uploadDir(coversDir, COVERS_BUCKET);

console.log("\nDone. Update seed.ts demo audioUrl/coverUrl to:");
console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${PREFIX}/<filename>.wav`);
console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${COVERS_BUCKET}/${PREFIX}/<filename>.svg`);
console.log("\nThen `git rm -r apps/web/public/demo` to drop the local copies.");
