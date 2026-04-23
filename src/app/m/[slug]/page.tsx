import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import type { MapClientProps } from "./MapClient";
import { MapClient } from "./MapClient";

export const dynamic = "force-dynamic";

async function loadMap(slug: string): Promise<MapClientProps | null> {
  const sb = supabaseServer();
  const { data: map } = await sb
    .from("maps")
    .select("id, title, description, value_label, value_unit, category_label, is_listed")
    .eq("slug", slug)
    .maybeSingle();
  if (!map || !map.is_listed) return null;

  const { data: markers } = await sb
    .from("markers")
    .select("id, lat, lng, name, value, category, address_normalized, extra")
    .eq("map_id", map.id);

  return {
    slug,
    title: map.title,
    description: map.description ?? "",
    valueLabel: map.value_label ?? null,
    valueUnit: map.value_unit ?? null,
    categoryLabel: map.category_label ?? null,
    markers: (markers ?? []).map((m) => ({
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      name: m.name,
      value: m.value,
      category: m.category,
      address_normalized: m.address_normalized,
      extra: (m.extra as Record<string, unknown>) ?? {},
    })),
  };
}

export async function generateMetadata(props: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const sb = supabaseServer();
  const { data } = await sb
    .from("maps")
    .select("title, description, is_listed")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.is_listed) return { title: "지도 없음" };
  return {
    title: `${data.title} · GonpunClaw PolicyMap`,
    description: data.description ?? undefined,
  };
}

export default async function MapPage(props: PageProps<"/m/[slug]">) {
  const { slug } = await props.params;
  const loaded = await loadMap(slug);
  if (!loaded) notFound();
  return <MapClient {...loaded} />;
}
