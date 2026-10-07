import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildSync } = createRequire(require.resolve("tsx"))("esbuild");
buildSync({ entryPoints: ["scripts/migrate.mjs"], bundle: true, platform: "node", format: "esm", outfile: "migrate.mjs" });
