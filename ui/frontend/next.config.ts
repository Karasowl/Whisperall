import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    // Expose DEV_MODE to the frontend
    NEXT_PUBLIC_DEV_MODE: process.env.DEV_MODE || "false",
  },
};

export default nextConfig;
