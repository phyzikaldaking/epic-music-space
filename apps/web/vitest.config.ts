import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  css: {
    // Prevent Vite from loading postcss.config.mjs (autoprefixer not installed in test env)
    postcss: {},
  },
  resolve: {
    alias: {
      "@ems/db": path.resolve(__dirname, "./__mocks__/@ems/db.ts"),
    },
  },
});
