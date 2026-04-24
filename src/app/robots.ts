import type { MetadataRoute } from "next";

const baseUrl = "https://gonpunclaw-policymap.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/upload", "/m/"],
      disallow: ["/manage/", "/staff/", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
