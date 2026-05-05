import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/web/vitest.config.mjs",
  "apps/api/vitest.config.ts",
  "packages/db/vitest.config.ts",
  "packages/utils/vitest.config.ts",
]);
