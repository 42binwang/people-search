import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      include: ["lib/**/*.ts"],
      // Ratchet: set just below the current level so the build fails on any
      // regression, and is bumped up as tests are added. Goal is 90%.
      thresholds: {
        statements: 79,
        branches: 69,
        functions: 85,
        lines: 79,
      },
    },
  },
});
