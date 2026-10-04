import { SITE_ORIGIN } from "@/lib/share/embed";

const baseUrl = SITE_ORIGIN;

const body = `User-Agent: *
Allow: /
Allow: /upload
Allow: /m/
Disallow: /manage/
Disallow: /staff/
Disallow: /api/

Content-Signal: ai-train=no, search=yes, ai-input=no

Host: ${baseUrl}
Sitemap: ${baseUrl}/sitemap.xml
`;

export async function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
