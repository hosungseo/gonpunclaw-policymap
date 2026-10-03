import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, buildApiUrl, buildEmbedSnippet, buildEmbedUrl, buildMapUrl, escapeHtmlAttr } from "@/lib/share/embed";

describe("share url builders", () => {
  it("builds map and embed urls with an optional query string", () => {
    expect(buildMapUrl(SITE_ORIGIN, "abc123", "")).toBe(`${SITE_ORIGIN}/m/abc123`);
    expect(buildMapUrl(SITE_ORIGIN, "abc123", "view=table")).toBe(`${SITE_ORIGIN}/m/abc123?view=table`);
    expect(buildEmbedUrl("http://localhost:3000", "abc123", "q=x")).toBe("http://localhost:3000/embed/abc123?q=x");
  });

  it("strips trailing slashes from the origin", () => {
    expect(buildMapUrl("https://x.com/", "s")).toBe("https://x.com/m/s");
    expect(buildApiUrl("https://x.com/", "s")).toBe("https://x.com/api/public/maps/s");
  });

  it("escapes html attribute characters", () => {
    expect(escapeHtmlAttr(`a"b<c>&'`)).toBe("a&quot;b&lt;c&gt;&amp;&#39;");
  });

  it("produces a responsive iframe snippet", () => {
    const snippet = buildEmbedSnippet({ origin: SITE_ORIGIN, slug: "abc123", title: `복지 "시설" 지도`, search: "cat=%EB%B3%B5%EC%A7%80" });
    expect(snippet).toContain(`src="${SITE_ORIGIN}/embed/abc123?cat=%EB%B3%B5%EC%A7%80"`);
    expect(snippet).toContain(`title="복지 &quot;시설&quot; 지도"`);
    expect(snippet).toContain("aspect-ratio:4/3");
    expect(snippet).toContain('loading="lazy"');
    expect(snippet.startsWith("<iframe")).toBe(true);
  });

  it("escapes an ampersand in the search string within the src attribute", () => {
    const snippet = buildEmbedSnippet({ origin: SITE_ORIGIN, slug: "abc123", title: "지도", search: "a=1&b=2" });
    expect(snippet).toContain(`src="${SITE_ORIGIN}/embed/abc123?a=1&amp;b=2"`);
  });
});
