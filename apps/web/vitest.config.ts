import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Exclude Next.js app directory files that require a full Next.js runtime
    include: ["src/lib/**/*.test.ts"],
  },
});
