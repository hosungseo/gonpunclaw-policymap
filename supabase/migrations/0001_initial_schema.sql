create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

create table maps (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  admin_token_hash text not null,
  title text not null,
  description text default '',
  value_label text,
  value_unit text,
  category_label text,
  is_listed boolean not null default false,
  source_file text,
  geocoder_stats jsonb not null default '{}'::jsonb,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table markers (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  row_index int not null,
  address_raw text not null,
  address_normalized text,
  lat double precision not null,
  lng double precision not null,
  name text,
  value numeric,
  category text,
  extra jsonb not null default '{}'::jsonb,
  geocoder_used text not null
);

create table geocode_failures (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  row_index int not null,
  address_raw text not null,
  reason text not null,
  attempted_providers text[] not null default '{}'
);

create table geocode_cache (
  address_raw text primary key,
  address_normalized text,
  lat double precision not null,
  lng double precision not null,
  provider text not null,
  cached_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  map_id uuid references maps(id) on delete set null,
  action text not null,
  ip_hash text,
  user_agent text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  reason text not null,
  reporter_ip_hash text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table deleted_slugs (
  slug text primary key,
  deleted_at timestamptz not null default now()
);
