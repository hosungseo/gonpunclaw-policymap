-- R3 collaboration: review gate, review token, directory hide, public directory view.

alter table public.maps
  add column if not exists review_required boolean not null default false,
  add column if not exists review_token_hash text,
  add column if not exists approved_version_id uuid references public.map_versions(id) on delete set null,
  add column if not exists directory_hidden boolean not null default false,
  add column if not exists directory_hidden_at timestamptz,
  add column if not exists directory_hidden_reason text;

create index if not exists maps_directory_idx on public.maps (visibility, directory_hidden, published_at desc);
create index if not exists maps_description_trgm_idx on public.maps using gin (description gin_trgm_ops);
create index if not exists maps_owner_department_trgm_idx on public.maps using gin (owner_department gin_trgm_ops);

create table if not exists public.map_reviews (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  version_id uuid references public.map_versions(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  request_note text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  comment text not null default '',
  reviewer_label text,
  reviewer_ip_hash text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists map_reviews_map_created_idx on public.map_reviews (map_id, created_at desc);
create index if not exists map_reviews_map_status_idx on public.map_reviews (map_id, status);

-- Service role only. No public policies on purpose.
alter table public.map_reviews enable row level security;

-- Directory source: public, not hidden, with included marker counts. Read with the service role.
create or replace view public.public_directory_maps as
select
  m.id,
  m.slug,
  m.title,
  m.description,
  m.source_name,
  m.owner_department,
  m.data_as_of,
  m.published_at,
  m.last_data_update_at,
  m.updated_at,
  m.review_required,
  m.current_version_id,
  m.approved_version_id,
  (select count(*) from public.markers k where k.map_id = m.id and k.included = true) as marker_count
from public.maps m
where m.visibility = 'public' and m.directory_hidden = false;

-- The view is read with the service role only. Make it honor caller privileges and keep it off the anon/authenticated surface.
alter view public.public_directory_maps set (security_invoker = true);
revoke all on public.public_directory_maps from anon, authenticated;

-- Token hashes must never be selectable through PostgREST, even on public rows.
revoke select (admin_token_hash, review_token_hash) on public.maps from anon, authenticated;

create index if not exists maps_approved_version_idx on public.maps (approved_version_id);
create index if not exists map_reviews_version_idx on public.map_reviews (version_id);
