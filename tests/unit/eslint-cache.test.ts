import { ESLint } from "eslint";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { it, expect } from "vitest";

it("serializes the configured parsers for Next.js lint caching", async () => {
  const cacheLocation = resolve(`.tmp-eslint-${process.pid}.cache`);
  try {
    const lint = new ESLint({
      cache: true,
      cacheStrategy: "content",
      cacheLocation,
    });
    const results = await lint.lintFiles([
      "eslint.config.mjs",
      "apps/backend/src/domain/checkout.ts",
    ]);
    expect(results.every((result) => result.errorCount === 0)).toBe(true);
    await expect(
      lint.lintFiles([
        "eslint.config.mjs",
        "apps/backend/src/domain/checkout.ts",
      ]),
    ).resolves.toHaveLength(2);
  } finally {
    await rm(cacheLocation, { force: true });
  }
});
