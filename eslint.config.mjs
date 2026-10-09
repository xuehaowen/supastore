import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: dirname(
    require.resolve("eslint-config-next/package.json"),
  ),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    ignores: [
      ".next/**",
      ".next-cuj/**",
      "coverage/**",
      "node_modules/**",
      ".pnpm-store/**",
      "test-results/**",
      "playwright-report/**",
      ".test-*/**",
      ".tmp-*/**",
      "dist/**",
      "build/**",
      "scripts/**",
      "tests/**",
      "apps/storefront/.next/**",
    ],
  },
];

export default eslintConfig;
