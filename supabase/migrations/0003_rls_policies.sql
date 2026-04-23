-- RLS policies for the public-facing MVP.
--
-- Strategy:
--   * RLS is already enabled on every table (initial migration).
--   * The service role bypasses RLS, so server routes using the service role
--     key continue to read/write freely.
--   * Anonymous + authenticated visitors only get the minimum needed to render
--     a public map view: SELECT on listed maps and SELECT on the markers that
--     belong to a listed map.
--   * Operational tables (geocode_cache, geocode_failures, audit_log, reports,
--     deleted_slugs) get no policies, meaning anon/auth roles cannot access
--     them at all even though RLS is on.

-- maps: public can read only listed maps.
create policy "maps_public_read_listed"
  on public.maps
  for select
  to anon, authenticated
  using (is_listed = true);

-- markers: public can read markers whose parent map is listed.
create policy "markers_public_read_listed"
  on public.markers
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.maps m
      where m.id = markers.map_id
        and m.is_listed = true
    )
  );

-- reports: anonymous visitors may file a report (insert only).
-- They cannot read other reports back; only the service role can.
create policy "reports_public_insert"
  on public.reports
  for insert
  to anon, authenticated
  with check (true);
