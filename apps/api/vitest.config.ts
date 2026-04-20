import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@ems/db": path.resolve(__dirname, "./__mocks__/@ems/db.ts"),
    },
  },
});
