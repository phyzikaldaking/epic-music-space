import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      // @ems/db needs prisma generate to exist on disk; provide a stub so
      // vite can resolve the module during test graph construction.  Each
      // test file overrides this stub with a vi.mock() factory.
      "@ems/db": path.resolve(__dirname, "src/__stubs__/ems-db.ts"),
    },
  },
});
