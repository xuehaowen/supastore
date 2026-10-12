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

// Next's Babel parser wrapper omits the metadata ESLint needs for cached configs.
const nextConfigs = compat.extends("next/core-web-vitals").map((config) => {
  const parser = config.languageOptions?.parser;
  if (!parser || parser.meta) return config;
  return {
    ...config,
    languageOptions: {
      ...config.languageOptions,
      parser: {
        ...parser,
        meta: {
          name: "eslint-config-next/parser",
          version: require("eslint-config-next/package.json").version,
        },
      },
    },
  };
});

const eslintConfig = [
  ...nextConfigs,
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/application/*", "@/infrastructure/*", "@/app/*"],
              message: "Domain rules must not depend on outer layers.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message: "Pass configuration into domain rules explicitly.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Pass the current time into domain rules explicitly.",
        },
      ],
    },
  },
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
