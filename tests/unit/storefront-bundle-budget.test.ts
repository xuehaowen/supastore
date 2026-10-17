import { afterEach, beforeEach, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, sep } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  measureStorefrontBundle,
  evaluateBundleBudget,
  publicRoutes,
} from "../../scripts/storefront-bundle.mjs";

let directory: string;
let pages: Record<string, string[]>;
beforeEach(() => {
  directory = mkdtempSync(join(realpathSync(tmpdir()), "supastore-bundle-"));
  mkdirSync(join(directory, "static/chunks"), { recursive: true });
  writeFileSync(join(directory, "static/chunks/shared.js"), "shared source");
  writeFileSync(join(directory, "static/chunks/page.js"), "page source");
  pages = Object.fromEntries(
    [
      "/layout",
      "/error",
      "/[locale]/layout",
      "/[locale]/error",
      ...publicRoutes,
    ].map((route) => [
      route,
      ["static/chunks/shared.js", "static/chunks/page.js"],
    ]),
  );
});
afterEach(() => {
  if (
    !directory.startsWith(realpathSync(tmpdir()) + sep) ||
    realpathSync(directory) !== directory
  )
    throw new Error("Unexpected fixture cleanup");
  rmSync(directory, { recursive: true });
});
function manifest() {
  writeFileSync(
    join(directory, "app-build-manifest.json"),
    JSON.stringify({ pages }),
  );
}
it("measures all four routes and counts each shared/error chunk once", () => {
  manifest();
  const report = measureStorefrontBundle(directory);
  expect(report.status).toBe("pass");
  expect(report.routes.map((route) => route.route)).toEqual(publicRoutes);
  expect(
    report.routes.every((route) => route.chunks === 2 && route.gzipBytes > 0),
  ).toBe(true);
});
it.each(["missing", "empty", "missing-file", "escape", "malformed"])(
  "refuses %s manifest evidence",
  (defect) => {
    if (defect === "missing") delete pages[publicRoutes[2]!];
    if (defect === "empty") pages[publicRoutes[0]!] = [];
    if (defect === "missing-file")
      pages[publicRoutes[0]!] = ["static/chunks/absent.js"];
    if (defect === "escape") pages[publicRoutes[0]!] = ["../../outside.js"];
    manifest();
    if (defect === "malformed")
      writeFileSync(join(directory, "app-build-manifest.json"), "{}");
    expect(() => measureStorefrontBundle(directory)).toThrow();
  },
);
it("enforces absolute and greater-than-ten-percent growth independently", () => {
  manifest();
  const measured = measureStorefrontBundle(directory).routes;
  const policy = JSON.parse(
    readFileSync(resolve("scripts/storefront-budgets.json"), "utf8"),
  );
  const route = publicRoutes[0]!;
  const baseline = policy.routes[route].baselineGzipBytes;
  const exact = measured.map((row) =>
    row.route === route
      ? { ...row, gzipBytes: Math.floor(baseline * 1.1) }
      : row,
  );
  expect(evaluateBundleBudget(exact).status).toBe("pass");
  exact[0]!.gzipBytes++;
  expect(evaluateBundleBudget(exact).routes[0]!.violations).toContain(
    "relative-growth",
  );
  exact[0]!.gzipBytes = 204801;
  expect(evaluateBundleBudget(exact).routes[0]!.violations).toEqual([
    "absolute-budget",
    "relative-growth",
  ]);
});
it("fails the real CLI when a route is missing instead of reporting a small bundle", () => {
  delete pages[publicRoutes[3]!];
  manifest();
  expect(() =>
    execFileSync(process.execPath, ["scripts/measure-storefront-bundle.mjs"], {
      env: { ...process.env, STOREFRONT_DIST_DIR: directory },
      stdio: "pipe",
    }),
  ).toThrow();
});
it("returns a nonzero budget status with actionable per-route evidence", () => {
  manifest();
  writeFileSync(join(directory, "static/chunks/page.js"), randomBytes(220000));
  const result = spawnSync(
    process.execPath,
    ["scripts/measure-storefront-bundle.mjs"],
    {
      env: { ...process.env, STOREFRONT_DIST_DIR: directory },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  expect(result.status).toBe(2);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: "fail",
    routes: expect.arrayContaining([
      expect.objectContaining({
        violations: ["absolute-budget", "relative-growth"],
      }),
    ]),
  });
});
