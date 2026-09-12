import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("frontend visual foundations", () => {
  it("provides component styles for every legacy admin layout hook", async () => {
    const stylesheet = await readFile(
      path.join(workspaceRoot, "src/app/globals.css"),
      "utf8",
    );

    for (const selector of [
      ".admin",
      ".admin-grid",
      ".panel",
      ".metrics",
      ".queue-row",
      ".eyebrow",
      ".two-col",
      ".check",
      ".narrow",
      ".standalone",
    ]) {
      expect(stylesheet).toMatch(new RegExp(`\\${selector}\\s*\\{`));
    }
  });
});
