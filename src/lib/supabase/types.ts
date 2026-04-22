export interface MapRow {
  id: string;
  slug: string;
  admin_token_hash: string;
  title: string;
  description: string;
  value_label: string | null;
  value_unit: string | null;
  category_label: string | null;
  is_listed: boolean;
  source_file: string | null;
  geocoder_stats: Record<string, number>;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface MarkerRow {
  id: string;
  map_id: string;
  row_index: number;
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  name: string | null;
  value: number | null;
  category: string | null;
  extra: Record<string, unknown>;
  geocoder_used: string;
}

export interface GeocodeCacheRow {
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  provider: string;
  cached_at: string;
}
