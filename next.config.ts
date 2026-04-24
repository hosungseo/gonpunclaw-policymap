import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "3mb" },
  },
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</sitemap.xml>; rel="sitemap", <https://github.com/hosungseo/gonpunclaw-policymap/blob/main/docs/USER-GUIDE-KO.md>; rel="service-doc", </llms.txt>; rel="alternate"; type="text/plain"',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
