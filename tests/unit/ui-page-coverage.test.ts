import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  backendPageRoutes,
  storefrontPageRoutes,
} from "../browser/ui-route-manifest";

function pageRoutes(root: string): string[] {
  const result: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "page.tsx")
        result.push("/" + relative(root, directory).replaceAll("\\", "/"));
    }
  }
  visit(root);
  return result.sort();
}

describe("explicit UI page audit coverage", () => {
  it.each([
    ["apps/backend/src/app", backendPageRoutes],
    ["apps/storefront/app", storefrontPageRoutes],
  ] as const)("includes every page in %s", (root, reviewed) => {
    expect([...reviewed].sort()).toEqual(pageRoutes(root));
    expect(new Set(reviewed).size).toBe(reviewed.length);
  });
});
