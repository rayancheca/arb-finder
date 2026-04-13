import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
  },
  transpilePackages: ["@arb/engine"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default config;
