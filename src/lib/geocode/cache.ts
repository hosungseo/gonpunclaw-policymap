import { supabaseServer } from "@/lib/supabase/server";
import type { GeocodeOk } from "./types";

export async function cacheGet(address: string): Promise<GeocodeOk | null> {
  const sb = supabaseServer();
  const { data } = await sb.from("geocode_cache").select("*").eq("address_raw", address).maybeSingle();
  if (!data) return null;
  return {
    ok: true,
    lat: data.lat,
    lng: data.lng,
    address_normalized: data.address_normalized ?? address,
    provider: data.provider as "kakao" | "vworld" | "juso",
  };
}

export async function cacheSet(address: string, result: GeocodeOk): Promise<void> {
  const sb = supabaseServer();
  await sb.from("geocode_cache").upsert({
    address_raw: address,
    address_normalized: result.address_normalized,
    lat: result.lat,
    lng: result.lng,
    provider: result.provider,
  });
}
