import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, sep, join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("discovers repository tests without temporary checkouts and demo copies", () => {
  const root = resolve(".");
  const folders = [".tmp-cuj", ".test-discovery", ".supastore-demo"].map(
    (parent) => {
      mkdirSync(parent, { recursive: true });
      const folder = mkdtempSync(join(parent, "discovery-"));
      mkdirSync(join(folder, "tests/unit"), { recursive: true });
      writeFileSync(
        join(folder, "tests/unit/bounded-multipart.test.ts"),
        "// Listing must not include this temporary checkout.\n",
      );
      return folder;
    },
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/vitest/vitest.mjs",
        "list",
        "bounded-multipart.test.ts",
        "--filesOnly",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("tests/unit/bounded-multipart.test.ts");
    for (const folder of folders)
      expect(result.stdout.replaceAll("\\", "/")).not.toContain(
        folder.replaceAll("\\", "/"),
      );
  } finally {
    for (const folder of folders) {
      const target = resolve(folder);
      if (!target.startsWith(root + sep))
        throw new Error("Fixture cleanup escaped repository.");
      rmSync(target, { recursive: true, force: true });
    }
  }
});
