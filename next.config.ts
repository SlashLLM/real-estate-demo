import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // The site folder is the build root (never a lockfile in a parent directory).
  turbopack: { root: resolve(".") },
  // The TotalWeb modules ship TypeScript source (copied into node_modules by pnpm `file:` deps).
  transpilePackages: ["@totalweb/ui", "@totalweb/supabase", "@totalweb/crm", "@totalweb/social"],
  // `next dev` only serves its scripts to localhost; the content engine (Docker) browses the site as host.docker.internal
  // to research and film it, so allow that origin in development (no effect on production builds).
  allowedDevOrigins: ["host.docker.internal"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default config;
