import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: { formats: ["image/avif", "image/webp"] },
};

export default nextConfig;
