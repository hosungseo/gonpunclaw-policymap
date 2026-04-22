create index maps_is_listed_created_at_idx on maps (is_listed, created_at desc);
create index maps_title_trgm_idx on maps using gin (title gin_trgm_ops);
create index markers_map_id_idx on markers (map_id);
create index geocode_failures_map_id_idx on geocode_failures (map_id);
create index reports_status_idx on reports (status, created_at desc);
