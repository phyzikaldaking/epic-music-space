import path from "node:path";
import {
  deriveSupabaseProjectRef,
  fail,
  loadEnvFile,
  repoRoot,
  runToolCommand,
} from "./lib.mjs";

const localValues = {
  ...loadEnvFile(path.join(repoRoot, ".env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/web/.env.local")),
  ...loadEnvFile(path.join(repoRoot, "apps/api/.env")),
};

const projectRef = deriveSupabaseProjectRef(localValues);

if (!projectRef) {
  fail("SUPABASE_PROJECT_REF is missing and NEXT_PUBLIC_SUPABASE_URL could not be parsed");
}

const result = runToolCommand("supabase", ["link", "--project-ref", projectRef], {
  stdio: "inherit",
});

if (!result.ok) {
  fail(result.stderr.trim() || result.stdout.trim() || "Supabase link failed");
}
