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
  visibility: "public" | "unlisted" | "private";
  source_file: string | null;
  source_name: string | null;
  source_url: string | null;
  data_as_of: string | null;
  owner_department: string | null;
  contact: string | null;
  license: string | null;
  refresh_cycle: string | null;
  next_review_at: string | null;
  published_at: string | null;
  last_data_update_at: string | null;
  metadata_confirmed_at: string | null;
  public_extra_columns: string[];
  column_mapping: Record<string, unknown>;
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
  quality_status: "success" | "review" | "manual";
  quality_reason: string | null;
  included: boolean;
  original_address: string | null;
  manual_corrected: boolean;
}

export interface GeocodeCacheRow {
  address_raw: string;
  address_normalized: string | null;
  lat: number;
  lng: number;
  provider: string;
  cached_at: string;
}

export interface UploadJobRow {
  id: string;
  map_id: string;
  slug: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_rows: number;
  processed_rows: number;
  inserted_count: number;
  failed_count: number;
  geocoder_stats: Record<string, number>;
  failure_preview: Array<{ row_index: number; address_raw: string; reason: string; attempted: string[] }>;
  rows: unknown[];
  job_token_hash: string | null;
  locked_until: string | null;
  cleanup_after: string | null;
  error_message: string | null;
  source_file: string | null;
  sheet_name: string | null;
  headers: string[];
  column_mapping: Record<string, unknown>;
  public_extra_columns: number[];
  preflight: Record<string, unknown>;
  review_confirmed_at: string | null;
  publish_confirmed_at: string | null;
  requested_visibility: "public" | "unlisted" | "private";
  quality_review_count: number;
  excluded_count: number;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}
