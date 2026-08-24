#!/usr/bin/env node

/** Upload the verified, ignored official-kit collection with a server-only key.
 * Run from an authorized Railway shell/CI job; never expose the service role key
 * to the browser or commit generated audio. */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = resolve(process.env.OFFICIAL_KIT_COLLECTION ?? ".artifacts/official-kits/collection-v1");
const manifestPath = join(root, "manifest.json");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = "studio-kits";

if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in the server environment");
if (!existsSync(manifestPath)) throw new Error(`Official kit manifest not found: ${manifestPath}`);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.curationStatus !== "resolved" || manifest.records?.length !== 120) throw new Error("Refusing to upload an unresolved or incomplete official-kit manifest");
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

for (const record of manifest.records) {
  const file = join(root, "processed", record.kitId, record.lane, `${record.assetId}.wav`);
  if (!existsSync(file)) throw new Error(`Missing processed asset: ${file}`);
  const { error } = await supabase.storage.from(bucket).upload(record.storagePath, createReadStream(file), { contentType: "audio/wav", upsert: false });
  if (error && !/already exists/i.test(error.message)) throw error;
  process.stdout.write(`verified ${record.storagePath}\n`);
}

console.log(`Uploaded/verified ${manifest.records.length} immutable official-kit assets to ${bucket}.`);
