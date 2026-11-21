import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.RAAST_NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
