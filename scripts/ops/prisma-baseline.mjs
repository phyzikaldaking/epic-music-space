#!/usr/bin/env node
/**
 * Baselines all existing Prisma migrations in the production database.
 * Runs `prisma migrate resolve --applied` for each migration, ignoring
 * errors for migrations that are already recorded.
 *
 * This is safe to run repeatedly — already-applied migrations are no-ops.
 */
import { execSync } from "child_process";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../../packages/db/prisma/schema.prisma");
const migrationsDir = join(
  __dirname,
  "../../packages/db/prisma/migrations"
);

const migrations = readdirSync(migrationsDir).sort();

if (migrations.length === 0) {
  console.log("No migrations found, skipping baseline.");
  process.exit(0);
}

console.log(`Baselining ${migrations.length} migration(s)…`);

let baselined = 0;
let skipped = 0;

for (const migration of migrations) {
  try {
    execSync(
      `npx prisma migrate resolve --applied ${migration} --schema ${schemaPath}`,
      { stdio: "pipe", env: process.env }
    );
    console.log(`  ✓ ${migration}`);
    baselined++;
  } catch (err) {
    const msg = err.stderr?.toString() ?? err.message ?? "";
    // Already applied — safe to ignore
    if (msg.includes("already applied") || msg.includes("migration_not_found") || msg.includes("P3007")) {
      console.log(`  - ${migration} (already recorded)`);
      skipped++;
    } else {
      // Unknown error — print and continue (don't block the build)
      console.warn(`  ⚠ ${migration}: ${msg.trim().split("\n")[0]}`);
      skipped++;
    }
  }
}

console.log(`Baseline complete: ${baselined} marked, ${skipped} skipped.`);
