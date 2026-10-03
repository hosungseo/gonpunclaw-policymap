// URL and snippet builders shared by the viewer share panel, embed page and public API.

export const SITE_ORIGIN = "https://gonpunclaw-policymap.vercel.app";

export function resolveOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return SITE_ORIGIN;
}

function withSearch(url: string, search: string): string {
  const qs = search.replace(/^\?/, "");
  return qs ? `${url}?${qs}` : url;
}

function stripTrailingSlashes(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function buildMapUrl(origin: string, slug: string, search = ""): string {
  return withSearch(`${stripTrailingSlashes(origin)}/m/${slug}`, search);
}

export function buildEmbedUrl(origin: string, slug: string, search = ""): string {
  return withSearch(`${stripTrailingSlashes(origin)}/embed/${slug}`, search);
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;");
}

export function buildEmbedSnippet({ origin, slug, title, search = "" }: { origin: string; slug: string; title: string; search?: string }): string {
  const src = escapeHtmlAttr(buildEmbedUrl(origin, slug, search));
  return `<iframe src="${src}" title="${escapeHtmlAttr(title)}" style="width:100%;aspect-ratio:4/3;border:0;min-height:480px" loading="lazy" allowfullscreen></iframe>`;
}
