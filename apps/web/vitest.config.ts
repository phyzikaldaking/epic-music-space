import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@ems/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
      "@ems/utils": path.resolve(__dirname, "../../packages/utils/src/index.ts"),
    },
  },
});
