import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    // Exclude Next.js app directory files that require a full Next.js runtime
    include: ["src/lib/**/*.test.ts"],
  },
});
