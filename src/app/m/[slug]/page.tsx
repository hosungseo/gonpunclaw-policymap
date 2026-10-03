import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { parseMapUrlState, toUrlSearchParams } from "@/lib/share/url-state";
import type { MapClientProps } from "./MapClient";
import { MapClient } from "./MapClient";

export const dynamic = "force-dynamic";

async function loadMap(slug: string): Promise<MapClientProps | null> {
  const sb = supabaseServer();
  const { data: map } = await sb
    .from("maps")
    .select("id, title, description, value_label, value_unit, category_label, is_listed, visibility, source_name, source_url, data_as_of, owner_department, contact, license, refresh_cycle, next_review_at, published_at, last_data_update_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!map || (map.visibility ? map.visibility === "private" : !map.is_listed)) return null;

  const [{ data: markers }, { data: failures }] = await Promise.all([
    sb.from("markers").select("id, lat, lng, name, value, category, address_normalized, extra, quality_status, included").eq("map_id", map.id),
    sb.from("geocode_failures").select("id").eq("map_id", map.id),
  ]);

  return {
    slug,
    title: map.title,
    description: map.description ?? "",
    valueLabel: map.value_label ?? null,
    valueUnit: map.value_unit ?? null,
    categoryLabel: map.category_label ?? null,
    visibility: map.visibility ?? (map.is_listed ? "public" : "private"),
    sourceName: map.source_name ?? null,
    sourceUrl: map.source_url ?? null,
    dataAsOf: map.data_as_of ?? null,
    ownerDepartment: map.owner_department ?? null,
    contact: map.contact ?? null,
    license: map.license ?? null,
    refreshCycle: map.refresh_cycle ?? null,
    nextReviewAt: map.next_review_at ?? null,
    lastDataUpdateAt: map.last_data_update_at ?? null,
    qualitySummary: {
      total: (markers ?? []).length,
      review: (markers ?? []).filter((marker) => marker.quality_status === "review").length,
      excluded: (markers ?? []).filter((marker) => marker.included === false).length,
      failed: failures?.length ?? 0,
    },
    markers: (markers ?? []).filter((m) => m.included !== false).map((m) => ({
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
    .select("title, description, is_listed, visibility")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || (data.visibility ? data.visibility === "private" : !data.is_listed)) return { title: "지도 없음" };
  return {
    title: `${data.title} · GonpunClaw PolicyMap`,
    description: data.description ?? undefined,
  };
}

export default async function MapPage(props: PageProps<"/m/[slug]">) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const loaded = await loadMap(slug);
  if (!loaded) notFound();
  // Parse share-link filters on the server so the first render already matches the URL.
  const categories = Array.from(new Set(loaded.markers.map((m) => m.category).filter((c): c is string => Boolean(c))));
  const initialUrlState = parseMapUrlState(toUrlSearchParams(searchParams), { categories });
  return <MapClient {...loaded} initialUrlState={initialUrlState} />;
}
