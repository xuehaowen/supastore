import path from "node:path";
import { defineConfig } from "vitest/config";

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
      include: ["apps/backend/src/domain/**/*.ts"],
      exclude: [
        "apps/backend/src/infrastructure/db/migrations/**",
        "apps/backend/src/infrastructure/db/schema/**",
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
    alias: [
      {
        find: /^@supastore\/ui\/utils$/,
        replacement: path.resolve(__dirname, "packages/ui/src/utils.ts"),
      },
      {
        find: /^@supastore\/ui\/(.+)$/,
        replacement: path.resolve(
          __dirname,
          "packages/ui/src/components/ui/$1",
        ),
      },
      {
        find: "@supastore/i18n/messages",
        replacement: path.resolve(
          __dirname,
          "packages/i18n/src/app/messages.ts",
        ),
      },
      {
        find: /^@supastore\/i18n\/(.+)$/,
        replacement: path.resolve(__dirname, "packages/i18n/src/$1"),
      },
      {
        find: /^@supastore\/shipping\/(.+)$/,
        replacement: path.resolve(__dirname, "packages/shipping/src/$1"),
      },
      {
        find: "@supastore/contracts/customer-page-validation",
        replacement: path.resolve(
          __dirname,
          "packages/contracts/src/customer-page-validation.ts",
        ),
      },
      {
        find: "@supastore/contracts/sitemap",
        replacement: path.resolve(
          __dirname,
          "packages/contracts/src/sitemap.ts",
        ),
      },
      ...Object.entries({
        "@supastore/contracts": path.resolve(
          __dirname,
          "./packages/contracts/src/index.ts",
        ),
        "@": path.resolve(__dirname, "./apps/backend/src"),
      }).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
});
