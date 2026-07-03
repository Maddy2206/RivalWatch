import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship raw TypeScript source (no build step) —
  // Next.js must transpile them rather than treating them as pre-built JS.
  transpilePackages: ["@rivalwatch/config", "@rivalwatch/core", "@rivalwatch/db"],
  webpack(config) {
    // Those packages import each other with the ESM ".js" extension
    // convention pointing at ".ts" source (e.g. "./env.js" -> "./env.ts").
    // Webpack needs an explicit alias to follow that; ts-node/tsx/vitest
    // resolve it natively but webpack does not by default.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
