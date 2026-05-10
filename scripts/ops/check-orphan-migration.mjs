import { PrismaClient } from "../../packages/db/generated/client/index.js";
const prisma = new PrismaClient();
try {
  const userColumns = await prisma.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='User' ORDER BY column_name"
  );
  const connectish = userColumns.filter((c) =>
    /connect|onboarding|stripe/i.test(c.column_name),
  );
  console.log("User columns matching /connect|onboarding|stripe/i:");
  for (const c of connectish) console.log("  -", c.column_name);

  const orphan = await prisma.$queryRawUnsafe(
    "SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at FROM _prisma_migrations WHERE migration_name LIKE '%connect_onboarding%' OR migration_name = '20260503210000_add_connect_onboarding_flags'",
  );
  console.log("\nOrphan migration row(s):");
  console.log(JSON.stringify(orphan, null, 2));

  const last8 = await prisma.$queryRawUnsafe(
    "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 8",
  );
  console.log("\nLast 8 migrations applied (newest first):");
  for (const m of last8) console.log("  -", m.migration_name, m.finished_at);
} finally {
  await prisma.$disconnect();
}
