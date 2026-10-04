import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { effectiveVisibility, loadPublicMapRecord, toMapClientProps } from "@/lib/maps/load-public-map";
import { parseMapUrlStateFromSearchParams } from "@/lib/share/url-state";
import { MapClient } from "./MapClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const record = await loadPublicMapRecord(slug);
  if (!record) return { title: "지도 없음" };
  return {
    title: `${record.map.title} · GonpunClaw PolicyMap`,
    description: record.map.description ?? undefined,
    // Link-only maps stay reachable but are kept out of search indexes.
    ...(effectiveVisibility(record.map) === "unlisted" ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function MapPage(props: PageProps<"/m/[slug]">) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const record = await loadPublicMapRecord(slug);
  if (!record) notFound();
  const clientProps = toMapClientProps(record);
  // Parse share-link filters on the server so the first render already matches the URL.
  const initialUrlState = parseMapUrlStateFromSearchParams(searchParams, clientProps.markers);
  return <MapClient {...clientProps} initialUrlState={initialUrlState} />;
}
