import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: () => ({
    from: () => ({
      select: () => ({
        or: () => ({
          order: () => ({
            limit: () => Promise.resolve({
              data: [
                { slug: "shown", updated_at: "2026-01-01T00:00:00Z", visibility: "public", is_listed: true, directory_hidden: false },
                { slug: "hidden", updated_at: "2026-01-01T00:00:00Z", visibility: "public", is_listed: true, directory_hidden: true },
              ],
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe("sitemap", () => {
  it("lists /maps and excludes directory-hidden maps", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://gonpunclaw-policymap.vercel.app/maps");
    expect(urls).toContain("https://gonpunclaw-policymap.vercel.app/m/shown");
    expect(urls).not.toContain("https://gonpunclaw-policymap.vercel.app/m/hidden");
  });
});
