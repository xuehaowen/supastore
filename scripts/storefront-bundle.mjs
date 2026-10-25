import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep, isAbsolute } from "node:path";
import { gzipSync } from "node:zlib";

export const publicRoutes = Object.freeze([
  "/[locale]/page",
  "/[locale]/products/[handle]/page",
  "/[locale]/cart/page",
  "/[locale]/checkout/page",
]);
const sharedEntries = [
  "/layout",
  "/error",
  "/[locale]/layout",
  "/[locale]/error",
];
const policy = JSON.parse(
  readFileSync(new URL("./storefront-budgets.json", import.meta.url), "utf8"),
);

export function evaluateBundleBudget(measurements) {
  if (
    policy.version !== 1 ||
    policy.maxIncreasePercent !== 10 ||
    Object.keys(policy.routes).length !== publicRoutes.length ||
    measurements.length !== publicRoutes.length
  )
    throw new Error("Invalid bundle policy or measurements");
  const routes = publicRoutes.map((route) => {
    const rows = measurements.filter((row) => row.route === route);
    const budget = policy.routes[route];
    if (
      rows.length !== 1 ||
      !budget ||
      ![
        budget.baselineGzipBytes,
        budget.maxGzipBytes,
        rows[0].gzipBytes,
        rows[0].rawBytes,
        rows[0].chunks,
      ].every((value) => Number.isSafeInteger(value) && value > 0)
    )
      throw new Error("Incomplete bundle measurements");
    const row = rows[0];
    const violations = [];
    if (row.gzipBytes > budget.maxGzipBytes) violations.push("absolute-budget");
    if (row.gzipBytes > Math.floor(budget.baselineGzipBytes * 1.1))
      violations.push("relative-growth");
    return {
      ...row,
      gzipKiB: Math.round((row.gzipBytes / 1024) * 10) / 10,
      ...budget,
      violations,
    };
  });
  return {
    metric: "compiled route/shared/error JS (sum of per-chunk gzip)",
    version: policy.version,
    baselineCommit: policy.baselineCommit,
    maxIncreasePercent: policy.maxIncreasePercent,
    status: routes.some((route) => route.violations.length) ? "fail" : "pass",
    routes,
  };
}

export function measureStorefrontBundle(directory) {
  const build = realpathSync(directory);
  const manifest = JSON.parse(
    readFileSync(resolve(build, "app-build-manifest.json"), "utf8"),
  );
  const pages = manifest.pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages))
    throw new Error("Missing build pages");
  for (const entry of [...sharedEntries, ...publicRoutes]) {
    if (
      !Array.isArray(pages[entry]) ||
      !pages[entry].length ||
      pages[entry].some((file) => typeof file !== "string") ||
      !pages[entry].some((file) => file.endsWith(".js"))
    )
      throw new Error("Missing required route/shared chunks");
  }
  return evaluateBundleBudget(
    publicRoutes.map((route) => {
      const files = [
        ...new Set([...sharedEntries, route].flatMap((entry) => pages[entry])),
      ].filter((file) => file.endsWith(".js"));
      let rawBytes = 0,
        gzipBytes = 0;
      for (const file of files) {
        const path = resolve(build, file);
        if (
          isAbsolute(file) ||
          !path.startsWith(build + sep) ||
          !realpathSync(path).startsWith(build + sep)
        )
          throw new Error("Invalid build chunk path");
        const bytes = readFileSync(path);
        rawBytes += bytes.length;
        gzipBytes += gzipSync(bytes).length;
      }
      return { route, chunks: files.length, rawBytes, gzipBytes };
    }),
  );
}
