import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabase/server";

const baseUrl = "https://gonpunclaw-policymap.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/upload`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
  try {
    const { data: maps } = await supabaseServer().from("maps").select("slug, updated_at, visibility, is_listed").or("visibility.eq.public,is_listed.eq.true").order("updated_at", { ascending: false }).limit(5000);
    return [...base, ...(maps ?? []).filter((map) => map.visibility ? map.visibility === "public" : map.is_listed).map((map) => ({ url: `${baseUrl}/m/${map.slug}`, lastModified: map.updated_at ? new Date(map.updated_at) : now, changeFrequency: "weekly" as const, priority: 0.7 }))];
  } catch {
    return base;
  }
}
