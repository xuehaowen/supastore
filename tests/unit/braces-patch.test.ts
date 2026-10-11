import { createRequire } from "node:module";
import { expect, it } from "vitest";
const root = createRequire(import.meta.url);
const config = createRequire(root.resolve("eslint-config-next/package.json"));
const plugin = createRequire(config.resolve("@next/eslint-plugin-next"));
const glob = createRequire(plugin.resolve("fast-glob"));
const matcher = createRequire(glob.resolve("micromatch"));
const braces = matcher("braces") as (
  input: string,
  options?: { expand: boolean },
) => string[];
it("preserves ordinary glob expansion", () => {
  expect(braces("src/{app,domain}/*.ts", { expand: true })).toEqual([
    "src/app/*.ts",
    "src/domain/*.ts",
  ]);
});
it("rejects excessive nested patterns before recursive expansion", () => {
  expect(() =>
    braces("{".repeat(4500) + "a" + "}".repeat(4500), { expand: true }),
  ).toThrow("nesting exceeds");
  expect(() => braces("(".repeat(4500) + "a" + ")".repeat(4500))).toThrow(
    "nesting exceeds",
  );
});
