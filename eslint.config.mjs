import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
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
