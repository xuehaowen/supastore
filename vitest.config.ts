import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    exclude: ["tests/browser/**", "node_modules/**"],
    globals: true,
    testTimeout: 20000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Unit coverage is a deterministic quality gate for the pure domain.
      // Database-backed use cases are measured by the integration command.
      include: ["src/domain/**/*.ts"],
      exclude: [
        "src/infrastructure/db/migrations/**",
        "src/infrastructure/db/schema/**",
        "src/infrastructure/auth/client.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
