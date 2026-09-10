import type { NextConfig } from 'next';

const isStandalone = process.env.STANDALONE === 'true' || process.env.DOCKER_BUILD === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isStandalone ? { output: 'standalone' } : {}),
};

export default nextConfig;
