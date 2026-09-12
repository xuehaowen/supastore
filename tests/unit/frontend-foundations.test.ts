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

  it("gives the storefront shell a labeled support landmark", async () => {
    const shopLayout = await readFile(
      path.join(workspaceRoot, "src/app/[locale]/layout.tsx"),
      "utf8",
    );

    expect(shopLayout).toContain('role="contentinfo"');
    expect(shopLayout).toContain('aria-label="Customer support"');
  });

  it("marks the active catalog filter for assistive technology", async () => {
    const catalog = await readFile(
      path.join(workspaceRoot, "src/app/catalog.tsx"),
      "utf8",
    );

    expect(catalog).toContain('aria-current={query.category ? undefined : "page"}');
    expect(catalog).toContain('aria-current={query.category === g.slug ? "page" : undefined}');
  });
});
