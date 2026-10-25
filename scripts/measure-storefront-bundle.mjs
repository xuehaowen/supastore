import { resolve } from "node:path";
import { measureStorefrontBundle } from "./storefront-bundle.mjs";

try {
  if (process.argv.length !== 2)
    throw new Error("Unsupported bundle arguments");
  const report = measureStorefrontBundle(
    resolve(
      "apps/storefront",
      process.env.STOREFRONT_DIST_DIR || process.env.NEXT_DIST_DIR || ".next",
    ),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "pass" ? 0 : 2;
} catch {
  console.error(
    "Cannot check storefront bundles: build all required routes and verify the manifest, chunks and versioned budget policy.",
  );
  process.exitCode = 1;
}
