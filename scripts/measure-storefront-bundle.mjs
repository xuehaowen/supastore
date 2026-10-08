import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
const build = resolve("apps/storefront/.next");
const manifest = JSON.parse(
  readFileSync(resolve(build, "app-build-manifest.json"), "utf8"),
);
const warningBytes = 200 * 1024;
const publicRoutes = ["/[locale]/page", "/[locale]/products/[handle]/page"];
const routes = publicRoutes.map((route) => {
  const files = [
    ...new Set([
      ...(manifest.pages["/layout"] || []),
      ...(manifest.pages["/error"] || []),
      ...(manifest.pages["/[locale]/layout"] || []),
      ...(manifest.pages[route] || []),
    ]),
  ].filter((file) => file.endsWith(".js"));
  let rawBytes = 0,
    gzipBytes = 0;
  for (const file of files) {
    const bytes = readFileSync(resolve(build, file));
    rawBytes += bytes.length;
    gzipBytes += gzipSync(bytes).length;
  }
  return {
    route,
    chunks: files.length,
    rawBytes,
    gzipBytes,
    gzipKiB: Math.round((gzipBytes / 1024) * 10) / 10,
    regressionWarning: gzipBytes > warningBytes,
  };
});
// A warning, never a launch restriction. This counts compiled initial JS chunks;
// browser network cache, RSC payloads, lazy chunks and compression vary separately.
console.log(
  JSON.stringify(
    {
      metric: "initial route JS from manifest (sum of per-chunk gzip)",
      warningKiB: 200,
      routes,
    },
    null,
    2,
  ),
);
