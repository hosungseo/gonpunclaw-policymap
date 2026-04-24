alter table upload_jobs
  add column if not exists job_token_hash text,
  add column if not exists locked_until timestamptz,
  add column if not exists cleanup_after timestamptz;

create index if not exists upload_jobs_locked_until_idx on upload_jobs(locked_until);
create index if not exists upload_jobs_cleanup_after_idx on upload_jobs(cleanup_after);

create table if not exists rate_limit_buckets (
  key text primary key,
  count int not null,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create or replace function take_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table(allowed boolean, retry_after_ms int)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_reset_at timestamptz := now() + make_interval(secs => p_window_seconds);
  v_count int;
  v_bucket_reset timestamptz;
begin
  delete from rate_limit_buckets
  where reset_at < v_now - interval '1 hour';

  insert into rate_limit_buckets as b (key, count, reset_at, updated_at)
  values (p_key, 1, v_reset_at, v_now)
  on conflict (key) do update
    set count = case
          when b.reset_at <= v_now then 1
          else b.count + 1
        end,
        reset_at = case
          when b.reset_at <= v_now then v_reset_at
          else b.reset_at
        end,
        updated_at = v_now
  returning b.count, b.reset_at into v_count, v_bucket_reset;

  if v_count <= p_limit then
    return query select true, 0;
  end if;

  return query select false, greatest(0, ceil(extract(epoch from (v_bucket_reset - v_now)) * 1000)::int);
end;
$$;
