import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(
  fileURLToPath(new URL("../../", import.meta.url)),
  process.env.NODE_ENV !== "production",
  console,
  true,
);
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "../../packages/config/security-headers.mjs";

const isStandalone =
  process.env.STANDALONE === "true" || process.env.DOCKER_BUILD === "true";

/** @type {import("next").NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: [
    "@supastore/ui",
    "@supastore/i18n",
    "@supastore/shipping",
    "@supastore/contracts",
  ],
  ...(process.env.SERVICE_ROLE === "backend"
    ? { assetPrefix: "/backend-assets" }
    : {}),
  images: { localPatterns: [{ pathname: "/api/assets" }], minimumCacheTTL: 60 },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG ?? "tsconfig.json" },
  ...(isStandalone ? { output: "standalone" } : {}),
};

export default createNextIntlPlugin("../../packages/i18n/src/app/request.ts")(
  nextConfig,
);
