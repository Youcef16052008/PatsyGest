import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the current sandbox preview host can reach development resources.
  allowedDevOrigins: process.env.E2B_SANDBOX_ID
    ? [`3000-${process.env.E2B_SANDBOX_ID}.e2b.app`]
    : [],
};

export default nextConfig;
