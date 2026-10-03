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
      {
        // Embeds are meant to be framed by third-party sites.
        source: "/embed/:slug*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
