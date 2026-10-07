import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const isStandalone =
  process.env.STANDALONE === "true" || process.env.DOCKER_BUILD === "true";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(process.env.SERVICE_ROLE === "backend" ? { assetPrefix: "/backend-assets" } : {}),
  images: { localPatterns: [{ pathname: "/api/assets" }], minimumCacheTTL: 60 },
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG ?? "tsconfig.json" },
  ...(isStandalone ? { output: "standalone" } : {}),
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
