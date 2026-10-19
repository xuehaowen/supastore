import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
import { resolveBackendOrigin } from "../../packages/config/backend-origin.mjs";
const backend = resolveBackendOrigin(process.env);
const nextConfig = {
  transpilePackages: [
    "@supastore/ui",
    "@supastore/i18n",
    "@supastore/shipping",
    "@supastore/contracts",
  ],
  images: { localPatterns: [{ pathname: "/api/assets" }], minimumCacheTTL: 60 },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: process.env.STOREFRONT_TSCONFIG || "tsconfig.json",
  },
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  ...(process.env.STANDALONE === "true" || process.env.DOCKER_BUILD === "true"
    ? { output: "standalone" }
    : {}),
  async rewrites() {
    return [
      { source: "/admin/:path*", destination: `${backend}/admin/:path*` },
      {
        source: "/backend-assets/_next/:path*",
        destination: `${backend}/_next/:path*`,
      },
    ];
  },
};

export default createNextIntlPlugin("../../packages/i18n/src/app/request.ts")(
  nextConfig,
);
