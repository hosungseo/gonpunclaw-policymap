-- R1 PolicyMap studio fields.
-- Existing maps remain readable through is_listed while new writes use visibility.

alter table public.maps
  add column if not exists visibility text,
  add column if not exists source_name text,
  add column if not exists source_url text,
  add column if not exists data_as_of date,
  add column if not exists owner_department text,
  add column if not exists contact text,
  add column if not exists license text,
  add column if not exists refresh_cycle text,
  add column if not exists next_review_at date,
  add column if not exists published_at timestamptz,
  add column if not exists last_data_update_at timestamptz,
  add column if not exists metadata_confirmed_at timestamptz,
  add column if not exists public_extra_columns jsonb not null default '[]'::jsonb,
  add column if not exists column_mapping jsonb not null default '{}'::jsonb,
  add column if not exists source_retention_until timestamptz;

update public.maps
set visibility = case when is_listed then 'public' else 'private' end
where visibility is null;

alter table public.maps alter column visibility set default 'private';
alter table public.maps alter column visibility set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maps_visibility_check'
  ) then
    alter table public.maps add constraint maps_visibility_check check (visibility in ('public', 'unlisted', 'private'));
  end if;
end $$;

create index if not exists maps_visibility_created_at_idx on public.maps (visibility, created_at desc);
create index if not exists maps_next_review_at_idx on public.maps (next_review_at);

alter table public.markers
  add column if not exists quality_status text not null default 'success',
  add column if not exists quality_reason text,
  add column if not exists included boolean not null default true,
  add column if not exists original_address text,
  add column if not exists manual_corrected boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'markers_quality_status_check'
  ) then
    alter table public.markers add constraint markers_quality_status_check check (quality_status in ('success', 'review', 'manual'));
  end if;
end $$;

create index if not exists markers_map_quality_idx on public.markers (map_id, quality_status, included);

alter table public.geocode_failures
  add column if not exists address_current text,
  add column if not exists included boolean not null default false,
  add column if not exists quality_status text not null default 'failed';

update public.geocode_failures set address_current = address_raw where address_current is null;

alter table public.upload_jobs
  add column if not exists sheet_name text,
  add column if not exists headers jsonb not null default '[]'::jsonb,
  add column if not exists column_mapping jsonb not null default '{}'::jsonb,
  add column if not exists public_extra_columns jsonb not null default '[]'::jsonb,
  add column if not exists preflight jsonb not null default '{}'::jsonb,
  add column if not exists review_confirmed_at timestamptz,
  add column if not exists publish_confirmed_at timestamptz,
  add column if not exists requested_visibility text not null default 'private',
  add column if not exists quality_review_count int not null default 0,
  add column if not exists excluded_count int not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'upload_jobs_requested_visibility_check'
  ) then
    alter table public.upload_jobs add constraint upload_jobs_requested_visibility_check check (requested_visibility in ('public', 'unlisted', 'private'));
  end if;
end $$;

create table if not exists public.review_actions (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references public.maps(id) on delete cascade,
  job_id uuid references public.upload_jobs(id) on delete set null,
  row_index int not null,
  action text not null check (action in ('address_update', 'coordinate_update', 'exclude', 'include', 'warning_ack')),
  before_value jsonb,
  after_value jsonb,
  actor_hash text,
  created_at timestamptz not null default now()
);

create index if not exists review_actions_map_row_idx on public.review_actions (map_id, row_index, created_at desc);

-- R1 visibility and review filters supersede the MVP is_listed-only policies.
drop policy if exists "maps_public_read_listed" on public.maps;
create policy "maps_public_read_visibility"
  on public.maps
  for select
  to anon, authenticated
  using (visibility = 'public');

drop policy if exists "markers_public_read_listed" on public.markers;
create policy "markers_public_read_visibility"
  on public.markers
  for select
  to anon, authenticated
  using (
    included = true
    and exists (
      select 1
      from public.maps m
      where m.id = markers.map_id
        and m.visibility = 'public'
    )
  );

-- Keep legacy is_listed consumers safe while the application migrates to visibility.
create or replace function public.sync_map_listing_flag()
returns trigger
language plpgsql
as $$
begin
  new.is_listed := (new.visibility = 'public');
  return new;
end;
$$;

drop trigger if exists maps_visibility_sync on public.maps;
create trigger maps_visibility_sync
before insert or update of visibility on public.maps
for each row execute function public.sync_map_listing_flag();
