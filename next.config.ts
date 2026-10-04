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
        // Everything except the public viewer (/m/*) and embeds (/embed/*) may only be framed by this origin.
        source: "/((?!embed/|m/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      {
        // Embeds and the public viewer are meant to be framed by third-party sites.
        source: "/embed/:slug+",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/m/:slug+",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Review links arrive with a secret token in the query string; never leak it via Referer
        // to tile servers or outbound source links.
        source: "/review/:slug*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
