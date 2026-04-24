create table upload_jobs (
  id uuid primary key default uuid_generate_v4(),
  map_id uuid not null references maps(id) on delete cascade,
  slug text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows int not null default 0,
  processed_rows int not null default 0,
  inserted_count int not null default 0,
  failed_count int not null default 0,
  geocoder_stats jsonb not null default '{}'::jsonb,
  failure_preview jsonb not null default '[]'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  error_message text,
  source_file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index upload_jobs_map_id_idx on upload_jobs(map_id);
create index upload_jobs_status_idx on upload_jobs(status);
