import path from "node:path";
import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  transpilePackages: ["@arb/engine"],
  // Pin the workspace root explicitly. Without this, Next.js infers it
  // from the nearest lockfile, which is ambiguous when running inside a
  // git worktree alongside the parent checkout.
  turbopack: {
    root: path.resolve(__dirname, "..", ".."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default config;
