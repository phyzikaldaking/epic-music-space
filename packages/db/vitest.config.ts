import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    alias: {
      "../generated/client": "./src/__tests__/generatedClientStub",
    },
  },
});
