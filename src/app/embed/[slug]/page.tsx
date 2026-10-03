import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadPublicMapRecord, toMapClientProps } from "@/lib/maps/load-public-map";
import { parseMapUrlStateFromSearchParams } from "@/lib/share/url-state";
import { MapClient } from "@/app/m/[slug]/MapClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/embed/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const record = await loadPublicMapRecord(slug);
  return {
    title: record ? `${record.map.title} (임베드)` : "지도 없음",
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage(props: PageProps<"/embed/[slug]">) {
  const [{ slug }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const record = await loadPublicMapRecord(slug);
  if (!record) notFound();
  const clientProps = toMapClientProps(record);
  const initialUrlState = parseMapUrlStateFromSearchParams(searchParams, clientProps.markers);
  return <MapClient {...clientProps} initialUrlState={initialUrlState} embed />;
}
